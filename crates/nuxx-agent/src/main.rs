fn main() {
    if let Err(e) = nuxx_agent::run() {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}
