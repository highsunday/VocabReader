#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/docs/readme-assets/source-videos"
readme_dir="$repo_root/docs/readme-assets"
website_dir="$repo_root/website/public/assets"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/vocabreader-public-gifs.XXXXXX")"

cleanup() {
  find "$staging_dir" -type f -delete 2>/dev/null || true
  find "$staging_dir" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

for command_name in ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

mkdir -p "$readme_dir" "$website_dir"

require_source() {
  local source_path="$1"
  if [[ ! -f "$source_path" ]]; then
    printf 'Missing source recording: %s\n' "$source_path" >&2
    exit 1
  fi
}

render_single() {
  local output_name="$1"
  local source_name="$2"
  local timing_scale="$3"
  local width="$4"
  local height="$5"
  local source_path="$source_dir/$source_name"
  require_source "$source_path"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$source_path" \
    -filter_complex "[0:v]setpts=${timing_scale}*PTS,fps=6,scale=${width}:${height}:flags=lanczos,setsar=1,format=rgb24,split[p0][p1];[p0]palettegen=max_colors=256:stats_mode=diff[p];[p1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
    -an -loop 0 "$staging_dir/$output_name"
}

render_concat() {
  local output_name="$1"
  local first_source_name="$2"
  local second_source_name="$3"
  local timing_scale="$4"
  local width="$5"
  local height="$6"
  local first_source_path="$source_dir/$first_source_name"
  local second_source_path="$source_dir/$second_source_name"
  require_source "$first_source_path"
  require_source "$second_source_path"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$first_source_path" \
    -i "$second_source_path" \
    -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0,setpts=${timing_scale}*PTS,fps=6,scale=${width}:${height}:flags=lanczos,setsar=1,format=rgb24,split[p0][p1];[p0]palettegen=max_colors=256:stats_mode=diff[p];[p1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
    -an -loop 0 "$staging_dir/$output_name"
}

render_concat \
  "ask-ai-context.gif" \
  "ask-ai-first-question.mp4" \
  "ask-ai-follow-up-question.mp4" \
  "0.2454" 800 500
render_single "explain-reader-annotations.gif" "explain-multiple-annotations.mp4" "0.2830" 800 500
render_single "add-cards-from-explanation.gif" "add-cards-from-explanation.mp4" "0.4910" 800 500
render_single "add-card-with-command.gif" "add-card-with-command.mp4" "0.5620" 800 500
render_single "spaced-review-workflow.gif" "spaced-review-workflow.mp4" "0.2461" 800 500
render_single "japanese-learning-workflow.gif" "japanese-annotation-to-learning-cards.mp4" "0.2084" 800 500
render_single "switch-learning-language.gif" "switch-language-learning-space.mp4" "0.6322" 800 500
render_single "listen-and-repeat.gif" "listen-and-repeat.mp4" "1.0000" 1100 660
render_single "sentence-practice.gif" "sentence-practice.mp4" "1.0000" 1100 660

for gif_path in "$staging_dir"/*.gif; do
  gif_name="$(basename "$gif_path")"
  frame_count="$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=nw=1:nk=1 "$gif_path")"
  if [[ -z "$frame_count" || "$frame_count" -le 1 ]]; then
    printf 'Generated GIF is not animated: %s\n' "$gif_name" >&2
    exit 1
  fi
done

for gif_path in "$staging_dir"/*.gif; do
  cp "$gif_path" "$readme_dir/$(basename "$gif_path")"
done

for gif_name in ask-ai-context.gif spaced-review-workflow.gif switch-learning-language.gif; do
  cp "$staging_dir/$gif_name" "$website_dir/$gif_name"
done

printf 'Updated README GIFs in %s\n' "$readme_dir"
printf 'Synchronized website GIFs in %s\n' "$website_dir"
