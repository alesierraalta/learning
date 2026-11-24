//! The model-free half of the `bin/embed` JSON Lines contract.
//!
//! The studio spawns one long-lived child, writes one request per line and
//! reads one response per line. Everything here can be tested without model
//! assets: framing, validation, prefixing, pooling output encoding and the
//! exact envelope the studio decodes.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Dimension of `Xenova/multilingual-e5-small` and of the studio index.
pub const DIM: usize = 384;
/// The studio never sends a larger batch.
pub const MAX_TEXTS: usize = 64;
/// Batch used for inference; requests may still carry up to [`MAX_TEXTS`].
pub const INFERENCE_BATCH: usize = 16;
pub const MODEL_NAME: &str = "multilingual-e5-small-q8";
pub const MAX_LENGTH: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Passage,
    Query,
}

impl Kind {
    fn prefix(self) -> &'static str {
        match self {
            Self::Passage => "passage: ",
            Self::Query => "query: ",
        }
    }
}

/// E5 models are trained with an explicit task prefix.
pub fn prefixed(kind: Kind, text: &str) -> String {
    format!("{}{}", kind.prefix(), text)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub id: String,
    pub kind: Kind,
    pub texts: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Ready {
    pub ready: bool,
    pub model: &'static str,
    pub dim: usize,
}

#[derive(Debug, Serialize)]
pub struct ReadyError {
    pub ready: bool,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct Response {
    pub id: String,
    pub dim: usize,
    /// One little-endian float32 base64 vector per input text.
    pub vectors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub id: String,
    pub error: String,
}

/// Splits an arbitrarily chunked byte stream into newline-delimited messages.
#[derive(Debug, Default)]
pub struct LineFraming {
    buffer: String,
}

impl LineFraming {
    pub fn new() -> Self {
        Self::default()
    }

    /// Appends a chunk and returns every complete line in arrival order.
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.buffer.push_str(chunk);
        let mut lines = Vec::new();
        while let Some(position) = self.buffer.find('\n') {
            let line = self.buffer[..position].trim_end_matches('\r').to_string();
            self.buffer = self.buffer[position + 1..].to_string();
            lines.push(line);
        }
        lines
    }

    /// Returns a final unterminated line, if the closed stream left one.
    pub fn finish(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.buffer);
        (!rest.trim().is_empty()).then_some(rest.trim_end_matches('\r').to_string())
    }
}

pub fn ready_line() -> String {
    to_json(&Ready {
        ready: true,
        model: MODEL_NAME,
        dim: DIM,
    })
}

pub fn ready_error_line(error: impl Into<String>) -> String {
    to_json(&ReadyError {
        ready: false,
        error: error.into(),
    })
}

pub fn parse_request(line: &str) -> Result<Request, String> {
    let request: Request =
        serde_json::from_str(line).map_err(|error| format!("invalid request: {error}"))?;
    if request.id.is_empty() {
        return Err("id must be a non-empty string".to_string());
    }
    if request.texts.is_empty() {
        return Err("texts must have at least one item".to_string());
    }
    if request.texts.len() > MAX_TEXTS {
        return Err(format!("texts must have at most {MAX_TEXTS} items"));
    }
    Ok(request)
}

/// Best-effort id for an error reply, including when the JSON itself is broken.
pub fn request_id(line: &str) -> String {
    serde_json::from_str::<Value>(line)
        .ok()
        .and_then(|value| value.get("id")?.as_str().map(ToOwned::to_owned))
        .unwrap_or_default()
}

pub fn error_response(id: &str, error: impl Into<String>) -> String {
    to_json(&ErrorResponse {
        id: id.to_string(),
        error: error.into(),
    })
}

/// Normalizes in place so the studio's brute-force cosine is a dot product.
pub fn l2_normalize(vector: &mut [f32]) -> Result<(), String> {
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if !norm.is_finite() || norm <= f32::EPSILON {
        return Err("cannot normalize a zero vector".to_string());
    }
    for value in vector {
        *value /= norm;
    }
    Ok(())
}

/// Serializes f32 values as little-endian bytes, matching Node's `readFloatLE`.
pub fn encode_vectors(vectors: Vec<Vec<f32>>) -> Result<Vec<String>, String> {
    vectors
        .into_iter()
        .map(|mut vector| {
            if vector.len() != DIM {
                return Err(format!("expected a {DIM}-dim vector, got {}", vector.len()));
            }
            l2_normalize(&mut vector)?;
            let mut bytes = Vec::with_capacity(DIM * 4);
            for value in vector {
                bytes.extend_from_slice(&value.to_le_bytes());
            }
            Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
        })
        .collect()
}

pub fn decode_vectors(encoded: &[String], expected: usize) -> Result<Vec<Vec<f32>>, String> {
    if encoded.len() != expected {
        return Err(format!(
            "expected {expected} vectors, got {}",
            encoded.len()
        ));
    }
    encoded
        .iter()
        .map(|item| {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(item)
                .map_err(|error| format!("invalid base64 vector: {error}"))?;
            if bytes.len() != DIM * 4 {
                return Err(format!("expected {} bytes, got {}", DIM * 4, bytes.len()));
            }
            Ok(bytes
                .as_chunks::<4>()
                .0
                .iter()
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect())
        })
        .collect()
}

/// One request in, one response out. `embed` receives already-prefixed texts.
pub fn handle_line(
    line: &str,
    mut embed: impl FnMut(Kind, &[String]) -> Result<Vec<Vec<f32>>, String>,
) -> String {
    let request = match parse_request(line) {
        Ok(request) => request,
        Err(error) => return error_response(&request_id(line), error),
    };
    let texts: Vec<String> = request
        .texts
        .iter()
        .map(|text| prefixed(request.kind, text))
        .collect();
    let vectors = match embed(request.kind, &texts) {
        Ok(vectors) if vectors.len() == texts.len() => vectors,
        Ok(vectors) => {
            return error_response(
                &request.id,
                format!("expected {} vectors, got {}", texts.len(), vectors.len()),
            )
        }
        Err(error) => return error_response(&request.id, error),
    };
    match encode_vectors(vectors) {
        Ok(vectors) => to_json(&Response {
            id: request.id,
            dim: DIM,
            vectors,
        }),
        Err(error) => error_response(&request.id, error),
    }
}

fn to_json(value: &impl Serialize) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| json!({"error": "could not serialize response"}).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framing_emits_a_final_unterminated_line() {
        let mut framing = LineFraming::new();
        assert_eq!(framing.push("uno\ndos"), vec!["uno".to_string()]);
        assert_eq!(framing.finish().as_deref(), Some("dos"));
    }
}
