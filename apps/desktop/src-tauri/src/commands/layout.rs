//! Layout computation Tauri command.
//!
//! Exposes casys_engine layout algorithms to the frontend.

use casys_engine::layout::{self, EdgeInput, LayoutConfig, LayoutResult, NodeInput, NodePosition};

/// Compute graph layout using force-directed algorithm.
///
/// # Arguments
/// * `nodes` - List of nodes with optional initial positions and levels
/// * `edges` - List of edges connecting nodes
/// * `config` - Layout configuration parameters
///
/// # Returns
/// Computed positions for all nodes
#[tauri::command]
pub async fn compute_layout(
    nodes: Vec<NodeInput>,
    edges: Vec<EdgeInput>,
    config: Option<LayoutConfig>,
) -> Result<LayoutResult, String> {
    // Run layout in background thread to avoid blocking UI
    let result = tokio::task::spawn_blocking(move || {
        let cfg = config.unwrap_or_default();
        layout::compute(nodes, edges, cfg)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Layout computation failed: {}", e))?;

    Ok(result)
}

/// Incrementally update layout when nodes are added.
///
/// # Arguments
/// * `existing_positions` - Current node positions
/// * `new_nodes` - Nodes to add
/// * `edges` - All edges (including new connections)
/// * `config` - Layout configuration
///
/// # Returns
/// Updated positions for all nodes
#[tauri::command]
pub async fn update_layout_incremental(
    existing_positions: Vec<NodePosition>,
    new_nodes: Vec<NodeInput>,
    edges: Vec<EdgeInput>,
    config: Option<LayoutConfig>,
) -> Result<LayoutResult, String> {
    let result = tokio::task::spawn_blocking(move || {
        let cfg = config.unwrap_or_default();
        layout::incremental::update_layout(existing_positions, new_nodes, edges, cfg)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Incremental layout failed: {}", e))?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_compute_layout_command() {
        let nodes = vec![
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

        let result = compute_layout(nodes, edges, None).await;
        assert!(result.is_ok());

        let layout = result.unwrap();
        assert_eq!(layout.positions.len(), 2);
    }
}
