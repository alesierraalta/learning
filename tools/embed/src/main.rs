use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use fastembed::{
    InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel,
};
use learning_embed::protocol::{
    handle_line, ready_error_line, ready_line, INFERENCE_BATCH, MAX_LENGTH,
};

fn usage() {
    eprintln!("usage: embed --model-dir <dir>");
    eprintln!("env: ORT_DYLIB_PATH=<libonnxruntime.so>, EMBED_THREADS=<positive integer>");
}

fn parse_args() -> Result<PathBuf, String> {
    let mut model_dir = None;
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--help" | "-h" => {
                usage();
                std::process::exit(0);
            }
            "--model-dir" => {
                let value = args.next().ok_or("--model-dir needs a directory")?;
                if model_dir.replace(PathBuf::from(value)).is_some() {
                    return Err("--model-dir given more than once".to_string());
                }
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }
    model_dir.ok_or_else(|| "--model-dir is required".to_string())
}

fn threads() -> Result<usize, String> {
    let value = env::var("EMBED_THREADS").unwrap_or_else(|_| "2".to_string());
    let threads: usize = value
        .parse()
        .map_err(|_| format!("EMBED_THREADS must be a positive integer, got {value:?}"))?;
    if threads == 0 {
        return Err("EMBED_THREADS must be a positive integer".to_string());
    }
    Ok(threads)
}

fn load_model(dir: &Path, threads: usize) -> Result<TextEmbedding, String> {
    let read = |name: &str| -> Result<Vec<u8>, String> {
        let path = dir.join(name);
        fs::read(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))
    };
    let model = UserDefinedEmbeddingModel::new(
        read("model_quantized.onnx")?,
        TokenizerFiles {
            tokenizer_file: read("tokenizer.json")?,
            config_file: read("config.json")?,
            special_tokens_map_file: read("special_tokens_map.json")?,
            tokenizer_config_file: read("tokenizer_config.json")?,
        },
    )
    .with_pooling(Pooling::Mean);
    let options = InitOptionsUserDefined::new()
        .with_max_length(MAX_LENGTH)
        .with_intra_threads(threads);
    TextEmbedding::try_new_from_user_defined(model, options)
        .map_err(|error| format!("cannot load the ONNX model: {error}"))
}

fn startup() -> Result<TextEmbedding, String> {
    let dir = parse_args()?;
    let dylib = env::var("ORT_DYLIB_PATH").map_err(|_| "ORT_DYLIB_PATH is required".to_string())?;
    if !Path::new(&dylib).is_file() {
        return Err(format!("ORT_DYLIB_PATH does not name a file: {dylib}"));
    }
    load_model(&dir, threads()?)
}

/// After `ready`, failures are diagnostics on stderr: the startup line stays unique.
fn serve(model: &mut TextEmbedding) -> io::Result<()> {
    let stdout = io::stdout();
    let mut out = stdout.lock();
    let stdin = io::stdin();
    let mut framing = learning_embed::protocol::LineFraming::new();
    for chunk in stdin.lock().split(b'\n') {
        let chunk = chunk?;
        let line = String::from_utf8(chunk)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let mut lines = framing.push(&line);
        if let Some(last) = framing.finish() {
            lines.push(last);
        }
        for request in lines {
            if request.trim().is_empty() {
                continue;
            }
            let response = handle_line(&request, |_, texts| {
                let mut vectors = Vec::with_capacity(texts.len());
                for batch in texts.chunks(INFERENCE_BATCH) {
                    let embedded = model
                        .embed(batch, Some(batch.len()))
                        .map_err(|error| format!("cannot embed a batch: {error}"))?;
                    vectors.extend(embedded);
                }
                Ok(vectors)
            });
            writeln!(out, "{response}")?;
            out.flush()?;
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    let mut model = match startup() {
        Ok(model) => model,
        Err(error) => {
            println!("{}", ready_error_line(error));
            return ExitCode::FAILURE;
        }
    };
    let stdout = io::stdout();
    {
        let mut out = stdout.lock();
        if writeln!(out, "{}", ready_line()).is_err() || out.flush().is_err() {
            eprintln!("cannot write the ready line");
            return ExitCode::FAILURE;
        }
    }
    match serve(&mut model) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("embedder stopped with an error: {error}");
            ExitCode::FAILURE
        }
    }
}
