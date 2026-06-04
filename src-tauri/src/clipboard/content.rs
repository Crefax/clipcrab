pub const PREVIEW_CHARS: usize = 240;

pub fn detect_category(content: &str) -> &'static str {
    let content_lower = content.to_lowercase();

    if content_lower.starts_with("http://")
        || content_lower.starts_with("https://")
        || content_lower.starts_with("www.")
    {
        return "url";
    }

    if content.contains('@')
        && content.split('@').count() == 2
        && content
            .split('@')
            .next_back()
            .map(|domain| domain.contains('.'))
            .unwrap_or(false)
        && !content.contains(' ')
    {
        return "email";
    }

    if content.contains("function")
        || content.contains("const ")
        || content.contains("let ")
        || content.contains("var ")
        || content.contains("def ")
        || content.contains("class ")
        || content.contains("import ")
        || content.contains("fn ")
        || content.contains("pub ")
        || content.contains("->")
        || content.contains("=>")
        || (content.contains('{') && content.contains('}'))
        || content.contains("#include")
        || content.contains("<script")
    {
        return "code";
    }

    "text"
}

pub fn content_hash(content_type: &str, content: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in content_type.bytes().chain([0]).chain(content.bytes()) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub fn bytes_hash(content_type: &str, bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in content_type.bytes().chain([0]).chain(bytes.iter().copied()) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub fn preview_text(content: &str) -> String {
    let mut preview = String::new();
    for (idx, ch) in content.chars().enumerate() {
        if idx >= PREVIEW_CHARS {
            preview.push_str("...");
            break;
        }
        preview.push(ch);
    }
    preview
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_categories() {
        assert_eq!(detect_category("https://example.com"), "url");
        assert_eq!(detect_category("hello@example.com"), "email");
        assert_eq!(detect_category("fn main() { println!(\"hi\"); }"), "code");
        assert_eq!(detect_category("plain note"), "text");
    }

    #[test]
    fn hash_is_stable_and_type_sensitive() {
        assert_eq!(content_hash("text", "hello"), content_hash("text", "hello"));
        assert_ne!(
            content_hash("text", "hello"),
            content_hash("image", "hello")
        );
        assert_ne!(content_hash("text", "hello"), content_hash("text", "world"));
    }

    #[test]
    fn byte_hash_is_stable_and_type_sensitive() {
        assert_eq!(bytes_hash("image", b"abc"), bytes_hash("image", b"abc"));
        assert_ne!(bytes_hash("text", b"abc"), bytes_hash("image", b"abc"));
        assert_ne!(bytes_hash("image", b"abc"), bytes_hash("image", b"abd"));
    }

    #[test]
    fn preview_is_bounded() {
        let input = "a".repeat(PREVIEW_CHARS + 10);
        let preview = preview_text(&input);
        assert!(preview.ends_with("..."));
        assert!(preview.chars().count() <= PREVIEW_CHARS + 3);
    }
}
