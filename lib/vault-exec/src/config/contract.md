# config contract

## Inputs

- vault-scoped config files such as `<vault>/.vault-exec/config.json`

## Outputs

- validated typed config objects
- explicit errors for malformed config content
- deterministic empty/default config objects when the config file is absent

## Invariants

- config loading must not depend on wall-clock state
- unsupported config variants must fail explicitly
- path normalization must be deterministic
