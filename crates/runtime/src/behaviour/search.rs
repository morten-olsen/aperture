/// Cosine similarity between two vectors. Returns 0.0 for zero-length vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    let denom = norm_a * norm_b;
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

/// Search behaviour embeddings for the closest matches to `query_embedding`.
///
/// Returns behaviour names sorted by descending similarity, filtered by
/// `threshold` and capped at `top_k`.
pub fn search_behaviours(
    query_embedding: &[f32],
    embeddings: &[(&str, &[f32])],
    threshold: f32,
    top_k: usize,
) -> Vec<String> {
    let mut scored: Vec<(&str, f32)> = embeddings
        .iter()
        .map(|(name, emb)| (*name, cosine_similarity(query_embedding, emb)))
        .filter(|(_, score)| *score >= threshold)
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);
    scored
        .into_iter()
        .map(|(name, _)| name.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_identical_vectors() {
        let v = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_orthogonal_vectors() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn search_respects_threshold() {
        let query = vec![1.0, 0.0];
        let embeddings: Vec<(&str, &[f32])> = vec![
            ("close", &[0.9, 0.1]),  // high similarity
            ("far", &[0.0, 1.0]),    // orthogonal
            ("medium", &[0.5, 0.5]), // moderate
        ];

        let results = search_behaviours(&query, &embeddings, 0.8, 5);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], "close");
    }

    #[test]
    fn search_returns_top_k() {
        let query = vec![1.0, 0.0, 0.0];
        // All very similar — only differ slightly.
        let embeddings: Vec<(&str, &[f32])> = vec![
            ("a", &[1.0, 0.01, 0.0]),
            ("b", &[1.0, 0.02, 0.0]),
            ("c", &[1.0, 0.03, 0.0]),
            ("d", &[1.0, 0.04, 0.0]),
            ("e", &[1.0, 0.05, 0.0]),
            ("f", &[1.0, 0.06, 0.0]),
            ("g", &[1.0, 0.07, 0.0]),
        ];

        let results = search_behaviours(&query, &embeddings, 0.0, 5);
        assert_eq!(results.len(), 5);
    }
}
