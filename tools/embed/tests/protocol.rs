use base64::Engine;
use learning_embed::protocol::{
    decode_vectors, encode_vectors, error_response, handle_line, l2_normalize, parse_request,
    prefixed, ready_error_line, ready_line, request_id, Kind, LineFraming, Request, DIM, MAX_TEXTS,
    MODEL_NAME,
};
use serde_json::{json, Value};

#[test]
fn framing_keeps_partial_lines_until_a_newline_arrives() {
    let mut framing = LineFraming::new();
    assert_eq!(
        framing.push("{\"id\":\"a\"}\n{\"id\":\"b\""),
        vec!["{\"id\":\"a\"}".to_string()]
    );
    assert_eq!(
        framing.push("}\n\n{\"id\":\"c\"}\r\n"),
        vec![
            "{\"id\":\"b\"}".to_string(),
            String::new(),
            "{\"id\":\"c\"}".to_string(),
        ]
    );
    assert!(framing.finish().is_none());
}

#[test]
fn ready_line_matches_the_studio_contract_exactly() {
    assert_eq!(
        ready_line(),
        r#"{"ready":true,"model":"multilingual-e5-small-q8","dim":384}"#
    );
    let value: Value = serde_json::from_str(&ready_line()).unwrap();
    assert_eq!(value["model"], MODEL_NAME);
    assert_eq!(value["dim"], DIM);
    assert!(!ready_error_line("modelo ausente").contains("\"model\""));
    assert_eq!(
        serde_json::from_str::<Value>(&ready_error_line("modelo ausente")).unwrap()["error"],
        "modelo ausente"
    );
}

#[test]
fn malformed_and_out_of_range_requests_become_id_matched_errors() {
    for line in [
        "not json",
        r#"{"id":"abc","kind":"otro","texts":["hola"]}"#,
        r#"{"id":"abc","kind":"query","texts":[]}"#,
        &format!(
            r#"{{"id":"abc","kind":"query","texts":{}}}"#,
            serde_json::to_string(&vec!["hola"; MAX_TEXTS + 1]).unwrap()
        ),
    ] {
        let error = parse_request(line).unwrap_err();
        let response: Value =
            serde_json::from_str(&error_response(&request_id(line), &error)).unwrap();
        assert_eq!(response["id"], request_id(line));
        assert!(response["error"].as_str().unwrap().len() > 3);
        assert!(response.get("vectors").is_none());
    }
    assert_eq!(request_id("not json"), "");
    assert_eq!(
        request_id(r#"{"id":"abc","kind":"query","texts":["hola"]}"#),
        "abc"
    );
}

#[test]
fn binary_adds_the_passage_and_query_prefixes() {
    assert_eq!(prefixed(Kind::Passage, "hola"), "passage: hola");
    assert_eq!(prefixed(Kind::Query, "hola"), "query: hola");
    let request: Request =
        serde_json::from_str(r#"{"id":"i","kind":"passage","texts":["hola"]}"#).unwrap();
    assert_eq!(request.kind, Kind::Passage);
}

#[test]
fn encoded_vectors_are_little_endian_float32_and_unit_length() {
    let mut vector = vec![0.0f32; DIM];
    vector[0] = 3.0;
    vector[1] = 4.0;
    l2_normalize(&mut vector).unwrap();
    assert!((vector[0] - 0.6).abs() < 1e-6);
    assert!((vector[1] - 0.8).abs() < 1e-6);
    assert!((vector.iter().map(|value| value * value).sum::<f32>() - 1.0).abs() < 1e-5);

    let encoded = encode_vectors(vec![vector.clone()]).unwrap();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&encoded[0])
        .unwrap();
    assert_eq!(bytes.len(), DIM * 4);
    assert_eq!(f32::from_le_bytes(bytes[0..4].try_into().unwrap()), 0.6);
    assert_eq!(f32::from_le_bytes(bytes[4..8].try_into().unwrap()), 0.8);
    let decoded = decode_vectors(&encoded, 1).unwrap();
    assert_eq!(decoded.len(), 1);
    assert_eq!(decoded[0].len(), DIM);
}

#[test]
fn a_request_without_a_model_still_round_trips_the_contract_envelope() {
    let line = r#"{"id":"r-1","kind":"query","texts":["uno","dos"]}"#;
    let response = handle_line(line, |kind, texts| {
        assert_eq!(kind, Kind::Query);
        assert_eq!(texts, &["query: uno".to_string(), "query: dos".to_string()]);
        Ok(vec![vec![1.0f32; DIM], vec![2.0f32; DIM]])
    });
    let reply: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(reply.get("id"), Some(&Value::from("r-1")));
    assert_eq!(reply.get("dim"), Some(&Value::from(DIM)));
    let vectors = reply.get("vectors").expect("vectors field");
    assert_eq!(vectors.as_array().unwrap().len(), 2);
    let encoded: Vec<String> = serde_json::from_value(vectors.clone()).unwrap();
    assert!(decode_vectors(&encoded, 2).is_ok());

    let failed = handle_line(line, |_, _| Err("modelo no cargado".to_string()));
    assert_eq!(
        serde_json::from_str::<Value>(&failed).unwrap(),
        json!({
            "id": "r-1",
            "error": "modelo no cargado",
        })
    );
}
