//! Graph layout module for computing node positions.
//!
//! Provides force-directed layout algorithms with hierarchical level support.

pub mod force_directed;
pub mod incremental;

use serde::{Deserialize, Serialize};

/// Configuration for layout computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    /// Number of iterations for force simulation (default: 300)
    pub iterations: u32,
    /// Repulsion force between nodes (default: 1000.0)
    pub repulsion: f32,
    /// Attraction force along edges (default: 0.1)
    pub attraction: f32,
    /// Vertical separation between hierarchy levels (default: 150.0)
    pub level_separation: f32,
    /// Damping factor for velocity (default: 0.85)
    pub damping: f32,
    /// Minimum movement threshold to stop early (default: 0.1)
    pub min_movement: f32,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            iterations: 300,
            repulsion: 1000.0,
            attraction: 0.1,
            level_separation: 150.0,
            damping: 0.85,
            min_movement: 0.1,
        }
    }
}

/// Input node for layout computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInput {
    pub id: String,
    /// Optional initial x position
    pub x: Option<f32>,
    /// Optional initial y position
    pub y: Option<f32>,
    /// Hierarchy level (0 = root, higher = deeper)
    pub level: u32,
}

/// Input edge for layout computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeInput {
    pub source: String,
    pub target: String,
    /// Optional edge weight (default: 1.0)
    pub weight: Option<f32>,
}

/// Computed position for a node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub level: u32,
}

/// Result of layout computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutResult {
    pub positions: Vec<NodePosition>,
    pub iterations_run: u32,
    pub converged: bool,
}

/// Main entry point for computing layout.
pub fn compute(
    nodes: Vec<NodeInput>,
    edges: Vec<EdgeInput>,
    config: LayoutConfig,
) -> Result<LayoutResult, LayoutError> {
    force_directed::compute_layout(nodes, edges, config)
}

/// Layout computation errors.
#[derive(Debug, thiserror::Error)]
pub enum LayoutError {
    #[error("No nodes provided")]
    EmptyGraph,
    #[error("Invalid edge reference: {0}")]
    InvalidEdge(String),
    #[error("Layout computation failed: {0}")]
    ComputationFailed(String),
}
