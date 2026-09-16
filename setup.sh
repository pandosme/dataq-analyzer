#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TARGET_DIR=$SOURCE_DIR

usage() {
  cat <<'EOF'
Usage: ./setup.sh [--target DIRECTORY]

Interactively creates .env and config.yaml for DataQ Analyzer. Existing files
are backed up before replacement. Secret values are never printed.

Options:
  --target DIRECTORY  Write configuration to another directory.
  -h, --help          Show this help.
EOF
}

while (($# > 0)); do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || { echo "Missing directory after --target" >&2; exit 1; }
      TARGET_DIR=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "$TARGET_DIR"
TARGET_DIR=$(cd "$TARGET_DIR" && pwd)
ENV_FILE="$TARGET_DIR/.env"
CONFIG_FILE="$TARGET_DIR/config.yaml"

if [[ ! -t 0 ]]; then
  echo "setup.sh requires an interactive terminal" >&2
  exit 1
fi

trim() {
  local value=$1
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

existing_env_value() {
  local key=$1 line value
  [[ -f "$ENV_FILE" ]] || return 0
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)
  [[ -n "$line" ]] || return 0
  value=${line#*=}
  if [[ ${#value} -ge 2 && ${value:0:1} == '"' && ${value: -1} == '"' ]]; then
    value=${value:1:${#value}-2}
    value=${value//\\"/"}
    value=${value//\\\\/\\}
  fi
  printf '%s' "$value"
}

is_placeholder() {
  [[ -z "$1" || "$1" == replace-with-* ]]
}

prompt_text() {
  local __result_var=$1 label=$2 default=$3 required=${4:-false} value
  while true; do
    read -r -p "$label [$default]: " value
    value=$(trim "$value")
    value=${value:-$default}
    if [[ "$required" == true && -z "$value" ]]; then
      echo "A value is required."
      continue
    fi
    if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
      echo "Line breaks are not allowed."
      continue
    fi
    printf -v "$__result_var" '%s' "$value"
    return
  done
}

prompt_number() {
  local __result_var=$1 label=$2 default=$3 min=$4 max=$5 number_input
  while true; do
    prompt_text number_input "$label" "$default" true
    if [[ "$number_input" =~ ^[0-9]+$ ]] && ((number_input >= min && number_input <= max)); then
      printf -v "$__result_var" '%s' "$number_input"
      return
    fi
    echo "Enter a number from $min to $max."
  done
}

prompt_yes_no() {
  local __result_var=$1 label=$2 default=$3 answer suffix
  [[ "$default" == true ]] && suffix='Y/n' || suffix='y/N'
  while true; do
    read -r -p "$label [$suffix]: " answer
    answer=$(trim "$answer")
    case "${answer,,}" in
      y|yes) printf -v "$__result_var" '%s' true; return ;;
      n|no) printf -v "$__result_var" '%s' false; return ;;
      '') printf -v "$__result_var" '%s' "$default"; return ;;
      *) echo "Enter yes or no." ;;
    esac
  done
}

prompt_secret() {
  local __result_var=$1 label=$2 existing=$3 min_length=$4 optional=${5:-false}
  local keep first second

  if ! is_placeholder "$existing"; then
    prompt_yes_no keep "Keep the existing $label?" true
    if [[ "$keep" == true ]]; then
      printf -v "$__result_var" '%s' "$existing"
      return
    fi
  fi

  while true; do
    read -r -s -p "$label: " first
    echo
    if [[ "$optional" == true && -z "$first" ]]; then
      printf -v "$__result_var" '%s' ''
      return
    fi
    if ((${#first} < min_length)); then
      echo "$label must contain at least $min_length characters."
      continue
    fi
    read -r -s -p "Confirm $label: " second
    echo
    if [[ "$first" != "$second" ]]; then
      echo "Values did not match."
      continue
    fi
    printf -v "$__result_var" '%s' "$first"
    return
  done
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

dotenv_quote() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}

yaml_quote() {
  dotenv_quote "$1"
}

backup_file() {
  local file=$1 timestamp=$2
  if [[ -f "$file" ]]; then
    cp -p "$file" "${file}.backup.${timestamp}"
    echo "Backed up $(basename "$file") to $(basename "$file").backup.${timestamp}"
  fi
}

echo
echo "DataQ Analyzer configuration setup"
echo "Target: $TARGET_DIR"
echo

existing_port=$(existing_env_value DATAQ_PORT)
existing_origin=$(existing_env_value CORS_ORIGIN)
existing_mongo_uri=$(existing_env_value MONGODB_URI)
existing_admin_username=$(existing_env_value BOOTSTRAP_ADMIN_USERNAME)
existing_admin_password=$(existing_env_value BOOTSTRAP_ADMIN_PASSWORD)
existing_jwt_secret=$(existing_env_value JWT_SECRET)
existing_encryption_key=$(existing_env_value CREDENTIAL_ENCRYPTION_KEY)
existing_mqtt_url=$(existing_env_value MQTT_BROKER_URL)
existing_mqtt_username=$(existing_env_value MQTT_USERNAME)
existing_mqtt_password=$(existing_env_value MQTT_PASSWORD)
existing_videox_key=$(existing_env_value VIDEOX_API_KEY)

prompt_text app_name "Application name" "DataQ Analyzer" true
prompt_number dataq_port "Host HTTP port" "${existing_port:-3303}" 1 65535
prompt_text cors_origin "Browser origin" "${existing_origin:-http://localhost:${dataq_port}}" true

default_bundled=true
if [[ -n "$existing_mongo_uri" && "$existing_mongo_uri" != mongodb://mongodb:* ]]; then
  default_bundled=false
fi
prompt_yes_no bundled_mongodb "Use the bundled MongoDB container?" "$default_bundled"
if [[ "$bundled_mongodb" == true ]]; then
  mongodb_uri='mongodb://mongodb:27017/dataq-analyzer'
  compose_file='docker-compose.yml:docker-compose.mongodb.yml'
else
  compose_file='docker-compose.yml'
  prompt_secret mongodb_uri "MongoDB URI (input hidden because it may contain credentials)" "$existing_mongo_uri" 10 false
  [[ "$mongodb_uri" == mongodb://* || "$mongodb_uri" == mongodb+srv://* ]] || {
    echo "MongoDB URI must begin with mongodb:// or mongodb+srv://" >&2
    exit 1
  }
fi

prompt_text bootstrap_admin_username "Initial administrator username" "${existing_admin_username:-admin}" true
prompt_secret bootstrap_admin_password "Initial administrator password" "$existing_admin_password" 12 false

if is_placeholder "$existing_jwt_secret"; then
  jwt_secret=$(generate_secret)
  echo "Generated a new JWT signing secret."
else
  jwt_secret=$existing_jwt_secret
  echo "Preserved the existing JWT signing secret."
fi

if is_placeholder "$existing_encryption_key"; then
  credential_encryption_key=$(generate_secret)
  echo "Generated a new device credential encryption key."
else
  credential_encryption_key=$existing_encryption_key
  echo "Preserved the existing device credential encryption key."
fi

prompt_yes_no mqtt_enabled "Enable MQTT ingestion?" false
mqtt_url=''
mqtt_username=''
mqtt_password=''
mqtt_tls=false
mqtt_topic='dataq/#'
if [[ "$mqtt_enabled" == true ]]; then
  prompt_text mqtt_url "MQTT broker URL" "${existing_mqtt_url:-mqtt://localhost:1883}" true
  [[ "$mqtt_url" == mqtt://* || "$mqtt_url" == mqtts://* || "$mqtt_url" == ws://* || "$mqtt_url" == wss://* ]] || {
    echo "MQTT URL must use mqtt://, mqtts://, ws://, or wss://" >&2
    exit 1
  }
  prompt_text mqtt_username "MQTT username (optional)" "$existing_mqtt_username" false
  prompt_secret mqtt_password "MQTT password (leave blank when unused)" "$existing_mqtt_password" 1 true
  [[ "$mqtt_url" == mqtts://* || "$mqtt_url" == wss://* ]] && mqtt_tls=true
  prompt_text mqtt_topic "MQTT topic prefix" "dataq/#" true
fi

prompt_yes_no playback_enabled "Enable recording playback?" false
playback_type='VideoX'
playback_url=''
videox_api_key=''
if [[ "$playback_enabled" == true ]]; then
  while true; do
    prompt_text playback_type "Playback type (VideoX, ACS, or Milestone)" "VideoX" true
    case "$playback_type" in
      VideoX|ACS|Milestone) break ;;
      *) echo "Choose VideoX, ACS, or Milestone." ;;
    esac
  done
  prompt_text playback_url "Playback server URL" "http://localhost:3002" true
  if [[ "$playback_type" == VideoX ]]; then
    prompt_secret videox_api_key "VideoX API key" "$existing_videox_key" 1 false
  fi
fi

prompt_number retention_days "Default data retention in days" 90 1 36500
while true; do
  prompt_text date_format "Default date format (US, EU, or ISO)" US true
  case "$date_format" in
    US|EU|ISO) break ;;
    *) echo "Choose US, EU, or ISO." ;;
  esac
done

echo
echo "Configuration summary"
echo "  Application: $app_name"
echo "  URL: $cors_origin"
echo "  MongoDB: $([[ "$bundled_mongodb" == true ]] && echo bundled || echo external)"
echo "  MQTT: $mqtt_enabled"
echo "  Playback: $playback_enabled"
echo "  Retention: $retention_days days"
echo "  Date format: $date_format"
echo
prompt_yes_no proceed "Write configuration files?" true
[[ "$proceed" == true ]] || { echo "No files changed."; exit 0; }

timestamp=$(date +%Y%m%d-%H%M%S)
backup_file "$ENV_FILE" "$timestamp"
backup_file "$CONFIG_FILE" "$timestamp"

umask 077
env_temp=$(mktemp "$TARGET_DIR/.env.tmp.XXXXXX")
config_temp=$(mktemp "$TARGET_DIR/config.yaml.tmp.XXXXXX")
trap 'rm -f "$env_temp" "$config_temp"' EXIT

cat >"$env_temp" <<EOF
NODE_ENV=production
PORT=80
DATAQ_PORT=$dataq_port
COMPOSE_FILE=$(dotenv_quote "$compose_file")
CORS_ORIGIN=$(dotenv_quote "$cors_origin")
CONFIG_PATH=config.yaml

MONGODB_URI=$(dotenv_quote "$mongodb_uri")

MQTT_BROKER_URL=$(dotenv_quote "$mqtt_url")
MQTT_USERNAME=$(dotenv_quote "$mqtt_username")
MQTT_PASSWORD=$(dotenv_quote "$mqtt_password")

JWT_SECRET=$(dotenv_quote "$jwt_secret")
JWT_EXPIRES_IN=7d
CREDENTIAL_ENCRYPTION_KEY=$(dotenv_quote "$credential_encryption_key")

BOOTSTRAP_ADMIN_USERNAME=$(dotenv_quote "$bootstrap_admin_username")
BOOTSTRAP_ADMIN_PASSWORD=$(dotenv_quote "$bootstrap_admin_password")

VIDEOX_API_KEY=$(dotenv_quote "$videox_api_key")
EOF

cat >"$config_temp" <<EOF
app:
  name: $(yaml_quote "$app_name")
  coordinateMax: 1000
  defaultPageSize: 100
  maxPageSize: 1000
  defaultTimeRangeHours: 24
  dataRetentionDays: $retention_days

display:
  dateFormat: $date_format
  pathVisualization:
    showStartPoints: true
    showEndPoints: true
    pathOpacity: 0.7
    pathLineWidth: 2

mqtt:
  enabled: $mqtt_enabled
  topicPrefix: $(yaml_quote "$mqtt_topic")
  useTls: $mqtt_tls
  rejectUnauthorized: true

playback:
  enabled: $playback_enabled
  type: $playback_type
  serverUrl: $(yaml_quote "$playback_url")
  preTime: 5
  postTime: 5

devices:
  defaults:
    retentionDays: null
    filters:
      minDistance: 20
      minAge: 2
EOF

chmod 600 "$env_temp"
chmod 644 "$config_temp"
mv "$env_temp" "$ENV_FILE"
mv "$config_temp" "$CONFIG_FILE"
trap - EXIT

echo
echo "Configuration written successfully."
echo "  Environment: $ENV_FILE (mode 600)"
echo "  Policy: $CONFIG_FILE"
if [[ "$TARGET_DIR" == "$SOURCE_DIR" && -d "$SOURCE_DIR/node_modules" ]]; then
  if npm --prefix "$SOURCE_DIR" run config:check; then
    echo "Configuration validation passed."
  else
    echo "Configuration was written, but validation failed. Restore the timestamped backups if needed." >&2
    exit 1
  fi
else
  echo "Run 'npm run config:check' from the project directory to validate it."
fi

echo
echo "Next step: npm run docker:up:build"
echo "Then open: http://localhost:$dataq_port"