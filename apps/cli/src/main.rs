use clap::{error::ErrorKind, Parser};
use ordercue_cli::{execute, Cli, CliError};

#[tokio::main]
async fn main() {
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) =>
        {
            error.print().ok();
            return;
        }
        Err(error) => exit_with_error(&CliError::usage(error.to_string())),
    };

    match execute(cli).await {
        Ok(value) if !value.is_null() => println!("{value}"),
        Ok(_) => {}
        Err(error) => exit_with_error(&error),
    }
}

fn exit_with_error(error: &CliError) -> ! {
    eprintln!("{}", error.as_json());
    std::process::exit(error.exit_code());
}
