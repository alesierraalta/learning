//! Real-model contract check. Skipped until `fetch.sh` has provisioned the
//! pinned model and ONNX Runtime library; `LEARNING_EMBED_DIR` can point at a
//! scratch asset directory.

use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use base64::Engine;
use learning_embed::protocol::{DIM, MODEL_NAME};
use serde_json::Value;

const ASSETS: [&str; 5] = [
    "model_quantized.onnx",
    "tokenizer.json",
    "config.json",
    "special_tokens_map.json",
    "tokenizer_config.json",
];

fn encoded_vectors(reply: &Value) -> Vec<String> {
    serde_json::from_value(reply.get("vectors").expect("vectors field").clone())
        .expect("vectors array")
}

fn asset_dir() -> PathBuf {
    if let Some(dir) = env::var_os("LEARNING_EMBED_DIR") {
        return PathBuf::from(dir);
    }
    let base = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env::var("HOME").unwrap_or_default()).join(".local/share")
        });
    base.join("learning/embed")
}

fn dylib(dir: &Path) -> PathBuf {
    env::var_os("LEARNING_EMBED_DYLIB")
        .map(PathBuf::from)
        .unwrap_or_else(|| dir.join("onnxruntime/lib/libonnxruntime.so"))
}

fn ready(dir: &Path) {
    if !ASSETS.iter().all(|name| dir.join(name).is_file()) || !dylib(dir).is_file() {
        eprintln!(
            "SKIP: real-model integration test: assets absent in {}. Run `bash tools/embed/fetch.sh {}` first.",
            dir.display(),
            dir.display()
        );
    }
}

fn read_line(reader: &mut BufReader<impl std::io::Read>) -> String {
    let mut line = String::new();
    assert!(
        reader
            .read_line(&mut line)
            .expect("cannot read embedder line")
            > 0,
        "embedder closed stdout before answering"
    );
    line.trim_end().to_string()
}

fn vector(encoded: &str) -> Vec<f32> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("vectors must be base64");
    assert_eq!(bytes.len(), DIM * 4);
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    left.iter().zip(right).map(|(a, b)| a * b).sum()
}

#[test]
fn real_model_answers_spanish_passages_and_ranks_the_query() {
    let dir = asset_dir();
    ready(&dir);
    if !ASSETS.iter().all(|name| dir.join(name).is_file()) || !dylib(&dir).is_file() {
        return;
    }

    let mut child = Command::new(env!("CARGO_BIN_EXE_embed"))
        .arg("--model-dir")
        .arg(&dir)
        .env("ORT_DYLIB_PATH", dylib(&dir))
        .env("EMBED_THREADS", "2")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("cannot start bin/embed");
    let mut stdin = child.stdin.take().expect("stdin was not piped");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout was not piped"));

    let startup: Value =
        serde_json::from_str(&read_line(&mut stdout)).expect("startup is not JSON");
    assert_eq!(startup["ready"], true, "startup: {startup}");
    assert_eq!(startup["model"], MODEL_NAME);
    assert_eq!(startup["dim"], DIM);

    let passages = [
        "La fotosíntesis es el proceso por el que las plantas convierten la luz del sol en energía química.",
        "La respiración celular libera energía a partir de la glucosa dentro de las mitocondrias.",
        "El sistema solar tiene ocho planetas y el Sol es una estrella.",
    ];
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"id": "p", "kind": "passage", "texts": passages})
    )
    .expect("cannot write passage request");
    stdin.flush().expect("cannot flush passage request");
    let response: Value =
        serde_json::from_str(&read_line(&mut stdout)).expect("passage reply is not JSON");
    assert_eq!(response["id"], "p");
    assert_eq!(response["dim"], DIM);
    let encoded = encoded_vectors(&response);
    assert_eq!(encoded.len(), passages.len());

    let vectors: Vec<Vec<f32>> = encoded.iter().map(|item| vector(item)).collect();
    for vector in &vectors {
        let norm: f32 = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-4, "norm was {norm}");
    }

    let query = "¿Cómo consiguen las plantas energía a partir de la luz solar?";
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"id": "q", "kind": "query", "texts": [query]})
    )
    .expect("cannot write query request");
    stdin.flush().expect("cannot flush query request");
    let response: Value =
        serde_json::from_str(&read_line(&mut stdout)).expect("query reply is not JSON");
    assert_eq!(response["id"], "q");
    let encoded = encoded_vectors(&response);
    assert_eq!(encoded.len(), 1);
    let query_vector = vector(&encoded[0]);

    let scores: Vec<f32> = vectors
        .iter()
        .map(|item| cosine(&query_vector, item))
        .collect();
    let best = scores
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| left.total_cmp(right))
        .map(|(index, _)| index)
        .expect("at least one score");
    assert_eq!(
        best, 0,
        "expected the photosynthesis passage, scores: {scores:?}"
    );

    drop(stdin);
    assert!(child.wait().expect("cannot wait for embedder").success());
}
