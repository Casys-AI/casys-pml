//! Incremental layout updates for adding/removing nodes without full recalculation.
//!
//! Strategies:
//! - New node: Place near connected nodes, run local iterations
//! - Removed node: No recalc needed, just remove from positions

use super::{
    force_directed, EdgeInput, LayoutConfig, LayoutError, LayoutResult, NodeInput, NodePosition,
};
use std::collections::{HashMap, HashSet};

/// Update layout incrementally when nodes are added.
///
/// # Strategy
/// 1. Keep existing positions for unchanged nodes
/// 2. Place new nodes near their connected neighbors (or center if isolated)
/// 3. Run limited iterations to settle new nodes
///
/// # Arguments
/// * `existing` - Current node positions
/// * `new_nodes` - Nodes to add
/// * `edges` - All edges (including new connections)
/// * `config` - Layout configuration
///
/// # Returns
/// Updated positions for all nodes
pub fn update_layout(
    existing: Vec<NodePosition>,
    new_nodes: Vec<NodeInput>,
    edges: Vec<EdgeInput>,
    config: LayoutConfig,
) -> Result<LayoutResult, LayoutError> {
    if existing.is_empty() && new_nodes.is_empty() {
        return Err(LayoutError::EmptyGraph);
    }

    // If no existing nodes, just do a full layout
    if existing.is_empty() {
        return force_directed::compute_layout(new_nodes, edges, config);
    }

    // If no new nodes, return existing as-is
    if new_nodes.is_empty() {
        return Ok(LayoutResult {
            positions: existing,
            iterations_run: 0,
            converged: true,
        });
    }

    // Build position index
    let mut pos_map: HashMap<String, (f32, f32)> = HashMap::new();
    for pos in &existing {
        pos_map.insert(pos.id.clone(), (pos.x, pos.y));
    }

    // Build set of all valid node IDs (F7 fix: validate edges)
    let mut all_node_ids: HashSet<String> = HashSet::new();
    for pos in &existing {
        all_node_ids.insert(pos.id.clone());
    }
    for node in &new_nodes {
        all_node_ids.insert(node.id.clone());
    }

    // F7 fix: Validate edges - fail fast if edge references unknown node
    for edge in &edges {
        if !all_node_ids.contains(&edge.source) {
            return Err(LayoutError::InvalidEdge(format!(
                "Edge source '{}' not found in existing or new nodes",
                edge.source
            )));
        }
        if !all_node_ids.contains(&edge.target) {
            return Err(LayoutError::InvalidEdge(format!(
                "Edge target '{}' not found in existing or new nodes",
                edge.target
            )));
        }
    }

    // Find connected existing nodes for each new node
    let mut new_node_neighbors: HashMap<String, Vec<(f32, f32)>> = HashMap::new();
    for node in &new_nodes {
        new_node_neighbors.insert(node.id.clone(), Vec::new());
    }

    for edge in &edges {
        // Check if edge connects a new node to an existing one
        if let Some(neighbors) = new_node_neighbors.get_mut(&edge.source) {
            if let Some(&(x, y)) = pos_map.get(&edge.target) {
                neighbors.push((x, y));
            }
        }
        if let Some(neighbors) = new_node_neighbors.get_mut(&edge.target) {
            if let Some(&(x, y)) = pos_map.get(&edge.source) {
                neighbors.push((x, y));
            }
        }
    }

    // Calculate center of existing positions for isolated new nodes
    let (center_x, center_y) = if existing.is_empty() {
        (0.0, 0.0)
    } else {
        let sum_x: f32 = existing.iter().map(|p| p.x).sum();
        let sum_y: f32 = existing.iter().map(|p| p.y).sum();
        let n = existing.len() as f32;
        (sum_x / n, sum_y / n)
    };

    // Place new nodes
    let mut all_nodes: Vec<NodeInput> = Vec::new();

    // Existing nodes keep their positions
    for pos in &existing {
        all_nodes.push(NodeInput {
            id: pos.id.clone(),
            x: Some(pos.x),
            y: Some(pos.y),
            level: pos.level,
        });
    }

    // New nodes placed near neighbors or center
    for node in &new_nodes {
        let neighbors = new_node_neighbors.get(&node.id).unwrap();
        let (x, y) = if neighbors.is_empty() {
            // Place at center with small offset
            let offset = simple_hash(&node.id) as f32 * 0.1;
            (center_x + offset.cos() * 50.0, center_y + offset.sin() * 50.0)
        } else {
            // Place at average of neighbor positions with level offset
            let sum_x: f32 = neighbors.iter().map(|(x, _)| x).sum();
            let sum_y: f32 = neighbors.iter().map(|(_, y)| y).sum();
            let n = neighbors.len() as f32;
            let offset = simple_hash(&node.id) as f32 * 0.1;
            (
                sum_x / n + offset.cos() * 30.0,
                sum_y / n + offset.sin() * 30.0 + (node.level as f32) * config.level_separation * 0.5,
            )
        };

        all_nodes.push(NodeInput {
            id: node.id.clone(),
            x: Some(x),
            y: Some(y),
            level: node.level,
        });
    }

    // Run limited iterations (10 for incremental, much faster than full)
    let incremental_config = LayoutConfig {
        iterations: 10,
        damping: 0.5, // Higher damping for faster settling
        ..config
    };

    force_directed::compute_layout(all_nodes, edges, incremental_config)
}

/// Remove nodes from layout.
///
/// This is a simple filter operation - no recalculation needed.
/// The remaining nodes keep their positions.
///
/// # Arguments
/// * `positions` - Current node positions
/// * `node_ids_to_remove` - IDs of nodes to remove
///
/// # Returns
/// Filtered positions
pub fn remove_nodes(
    positions: Vec<NodePosition>,
    node_ids_to_remove: &[String],
) -> Vec<NodePosition> {
    let remove_set: HashSet<&String> = node_ids_to_remove.iter().collect();
    positions
        .into_iter()
        .filter(|p| !remove_set.contains(&p.id))
        .collect()
}

/// Simple hash function for deterministic offsets.
fn simple_hash(s: &str) -> u32 {
    let mut hash: u32 = 0;
    for c in s.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(c as u32);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incremental_add_node() {
        let existing = vec![
            NodePosition {
                id: "a".to_string(),
                x: 0.0,
                y: 0.0,
                level: 0,
            },
            NodePosition {
                id: "b".to_string(),
                x: 100.0,
                y: 0.0,
                level: 0,
            },
        ];

        let new_nodes = vec![NodeInput {
            id: "c".to_string(),
            x: None,
            y: None,
            level: 0,
        }];

        let edges = vec![
            EdgeInput {
                source: "a".to_string(),
                target: "b".to_string(),
                weight: None,
            },
            EdgeInput {
                source: "b".to_string(),
                target: "c".to_string(),
                weight: None,
            },
        ];

        let result = update_layout(existing, new_nodes, edges, LayoutConfig::default()).unwrap();

        assert_eq!(result.positions.len(), 3);
        assert!(result.iterations_run <= 10, "Should use limited iterations");

        // New node should be near node b
        let c = result.positions.iter().find(|p| p.id == "c").unwrap();
        let b = result.positions.iter().find(|p| p.id == "b").unwrap();
        let dist = ((c.x - b.x).powi(2) + (c.y - b.y).powi(2)).sqrt();
        assert!(
            dist < 500.0,
            "New node should be reasonably close to connected node"
        );
    }

    #[test]
    fn test_incremental_isolated_node() {
        let existing = vec![
            NodePosition {
                id: "a".to_string(),
                x: 0.0,
                y: 0.0,
                level: 0,
            },
            NodePosition {
                id: "b".to_string(),
                x: 100.0,
                y: 100.0,
                level: 0,
            },
        ];

        let new_nodes = vec![NodeInput {
            id: "isolated".to_string(),
            x: None,
            y: None,
            level: 0,
        }];

        // No edges to the new node
        let edges = vec![EdgeInput {
            source: "a".to_string(),
            target: "b".to_string(),
            weight: None,
        }];

        let result = update_layout(existing, new_nodes, edges, LayoutConfig::default()).unwrap();

        assert_eq!(result.positions.len(), 3);

        // Isolated node should be placed near center
        let isolated = result
            .positions
            .iter()
            .find(|p| p.id == "isolated")
            .unwrap();
        // Center is (50, 50), isolated should be somewhere nearby
        assert!(
            (isolated.x - 50.0).abs() < 200.0,
            "Isolated node should be near center x"
        );
        assert!(
            (isolated.y - 50.0).abs() < 200.0,
            "Isolated node should be near center y"
        );
    }

    #[test]
    fn test_remove_nodes() {
        let positions = vec![
            NodePosition {
                id: "a".to_string(),
                x: 0.0,
                y: 0.0,
                level: 0,
            },
            NodePosition {
                id: "b".to_string(),
                x: 100.0,
                y: 0.0,
                level: 0,
            },
            NodePosition {
                id: "c".to_string(),
                x: 200.0,
                y: 0.0,
                level: 0,
            },
        ];

        let result = remove_nodes(positions, &["b".to_string()]);

        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|p| p.id != "b"));
        assert!(result.iter().any(|p| p.id == "a"));
        assert!(result.iter().any(|p| p.id == "c"));
    }

    #[test]
    fn test_empty_new_nodes() {
        let existing = vec![NodePosition {
            id: "a".to_string(),
            x: 42.0,
            y: 24.0,
            level: 0,
        }];

        let result =
            update_layout(existing.clone(), vec![], vec![], LayoutConfig::default()).unwrap();

        assert_eq!(result.positions.len(), 1);
        assert_eq!(result.positions[0].x, 42.0);
        assert_eq!(result.positions[0].y, 24.0);
        assert!(result.converged);
        assert_eq!(result.iterations_run, 0);
    }

    #[test]
    fn test_empty_existing_fallback_to_full() {
        let new_nodes = vec![
            NodeInput {
                id: "a".to_string(),
                x: None,
                y: None,
                level: 0,
            },
            NodeInput {
                id: "b".to_string(),
                x: None,
                y: None,
                level: 1,
            },
        ];

        let edges = vec![EdgeInput {
            source: "a".to_string(),
            target: "b".to_string(),
            weight: None,
        }];

        let result = update_layout(vec![], new_nodes, edges, LayoutConfig::default()).unwrap();

        assert_eq!(result.positions.len(), 2);
    }

    // F7 fix: Test that invalid edges are rejected (not silently ignored)
    #[test]
    fn test_invalid_edge_in_incremental() {
        let existing = vec![NodePosition {
            id: "a".to_string(),
            x: 0.0,
            y: 0.0,
            level: 0,
        }];

        let new_nodes = vec![NodeInput {
            id: "b".to_string(),
            x: None,
            y: None,
            level: 0,
        }];

        // Edge references non-existent node "c"
        let edges = vec![EdgeInput {
            source: "b".to_string(),
            target: "c".to_string(), // Invalid!
            weight: None,
        }];

        let result = update_layout(existing, new_nodes, edges, LayoutConfig::default());
        assert!(
            matches!(result, Err(LayoutError::InvalidEdge(_))),
            "Should fail on invalid edge, not silently ignore"
        );
    }
}
