# Large GitHub content fallback

Cloudflare acquisition now falls back from the GitHub Contents API payload to the Git blob API when `content` is omitted for large files. This prevents empty-base64 parsing failures as the US growth registry grows beyond the Contents API inline-content threshold.
