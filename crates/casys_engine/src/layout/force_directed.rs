//! Force-directed graph layout with Barnes-Hut optimization and hierarchy support.
//!
//! Implements Fruchterman-Reingold algorithm with:
//! - Quadtree for O(n log n) repulsion computation
//! - Level-based vertical clustering
//! - Early convergence detection

use super::{EdgeInput, LayoutConfig, LayoutError, LayoutResult, NodeInput, NodePosition};
use std::collections::HashMap;

/// Safety limits to prevent DoS and numerical instability
const MAX_ITERATIONS: u32 = 10_000;
const MAX_MASS: f32 = 100.0;
const MIN_DIST_SQ: f32 = 0.01;
const MIN_BBOX_SIZE: f32 = 100.0;

/// Internal node state during simulation.
#[derive(Debug, Clone)]
struct SimNode {
    id: String,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    level: u32,
}

/// Bounding box for quadtree.
#[derive(Debug, Clone, Copy)]
struct BoundingBox {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

impl BoundingBox {
    #[allow(dead_code)]
    fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }

    fn quadrant(&self, qx: usize, qy: usize) -> BoundingBox {
        let hw = self.width / 2.0;
        let hh = self.height / 2.0;
        BoundingBox {
            x: self.x + (qx as f32) * hw,
            y: self.y + (qy as f32) * hh,
            width: hw,
            height: hh,
        }
    }
}

/// Quadtree node for Barnes-Hut algorithm.
enum QuadNode {
    Empty,
    Leaf {
        x: f32,
        y: f32,
        mass: f32,
    },
    Branch {
        center_of_mass_x: f32,
        center_of_mass_y: f32,
        total_mass: f32,
        children: Box<[QuadNode; 4]>,
        bounds: BoundingBox,
    },
}

impl QuadNode {
    fn new() -> Self {
        QuadNode::Empty
    }

    fn insert(&mut self, x: f32, y: f32, mass: f32, bounds: BoundingBox, depth: usize) {
        const MAX_DEPTH: usize = 20;

        match self {
            QuadNode::Empty => {
                *self = QuadNode::Leaf { x, y, mass };
            }
            QuadNode::Leaf {
                x: ox,
                y: oy,
                mass: om,
            } => {
                if depth >= MAX_DEPTH {
                    // Accumulate at max depth with mass cap (F1 fix)
                    let total = (*om + mass).min(MAX_MASS);
                    *self = QuadNode::Leaf {
                        x: (*ox * *om + x * mass) / (*om + mass),
                        y: (*oy * *om + y * mass) / (*om + mass),
                        mass: total,
                    };
                    return;
                }

                let old_x = *ox;
                let old_y = *oy;
                let old_mass = *om;

                // Convert to branch
                *self = QuadNode::Branch {
                    center_of_mass_x: 0.0,
                    center_of_mass_y: 0.0,
                    total_mass: 0.0,
                    children: Box::new([
                        QuadNode::Empty,
                        QuadNode::Empty,
                        QuadNode::Empty,
                        QuadNode::Empty,
                    ]),
                    bounds,
                };

                // Re-insert old node
                self.insert(old_x, old_y, old_mass, bounds, depth);
                // Insert new node
                self.insert(x, y, mass, bounds, depth);
            }
            QuadNode::Branch {
                center_of_mass_x,
                center_of_mass_y,
                total_mass,
                children,
                bounds: bb,
            } => {
                // Update center of mass with cap (F1 fix)
                let new_total = (*total_mass + mass).min(MAX_MASS);
                let weight_sum = *total_mass + mass;
                *center_of_mass_x = (*center_of_mass_x * *total_mass + x * mass) / weight_sum;
                *center_of_mass_y = (*center_of_mass_y * *total_mass + y * mass) / weight_sum;
                *total_mass = new_total;

                // Find quadrant
                let mid_x = bb.x + bb.width / 2.0;
                let mid_y = bb.y + bb.height / 2.0;
                let qx = if x < mid_x { 0 } else { 1 };
                let qy = if y < mid_y { 0 } else { 1 };
                let idx = qy * 2 + qx;
                let child_bounds = bb.quadrant(qx, qy);

                children[idx].insert(x, y, mass, child_bounds, depth + 1);
            }
        }
    }

    fn compute_force(&self, x: f32, y: f32, theta: f32, repulsion: f32) -> (f32, f32) {
        match self {
            QuadNode::Empty => (0.0, 0.0),
            QuadNode::Leaf {
                x: ox,
                y: oy,
                mass,
            } => {
                let dx = x - ox;
                let dy = y - oy;
                let dist_sq = (dx * dx + dy * dy).max(MIN_DIST_SQ); // F2 fix: consistent threshold
                let dist = dist_sq.sqrt();
                let force = repulsion * mass / dist_sq;
                (force * dx / dist, force * dy / dist)
            }
            QuadNode::Branch {
                center_of_mass_x,
                center_of_mass_y,
                total_mass,
                children,
                bounds,
            } => {
                let dx = x - center_of_mass_x;
                let dy = y - center_of_mass_y;
                let dist_sq = (dx * dx + dy * dy).max(MIN_DIST_SQ); // F2 fix: consistent threshold
                let dist = dist_sq.sqrt();

                // Barnes-Hut criterion: if s/d < theta, treat as single body
                let s = bounds.width.max(bounds.height);
                if s / dist < theta {
                    let force = repulsion * total_mass / dist_sq;
                    (force * dx / dist, force * dy / dist)
                } else {
                    // Recurse into children
                    let mut fx = 0.0;
                    let mut fy = 0.0;
                    for child in children.iter() {
                        let (cfx, cfy) = child.compute_force(x, y, theta, repulsion);
                        fx += cfx;
                        fy += cfy;
                    }
                    (fx, fy)
                }
            }
        }
    }
}

/// Compute layout using force-directed algorithm with Barnes-Hut optimization.
pub fn compute_layout(
    nodes: Vec<NodeInput>,
    edges: Vec<EdgeInput>,
    config: LayoutConfig,
) -> Result<LayoutResult, LayoutError> {
    if nodes.is_empty() {
        return Err(LayoutError::EmptyGraph);
    }

    // F11 fix: Cap iterations to prevent DoS
    let iterations = config.iterations.min(MAX_ITERATIONS);

    // Build node index
    let mut node_index: HashMap<String, usize> = HashMap::new();
    let mut sim_nodes: Vec<SimNode> = Vec::with_capacity(nodes.len());

    // Initialize positions
    let n = nodes.len() as f32;
    let spread = (n * 100.0).sqrt();

    for (i, node) in nodes.iter().enumerate() {
        node_index.insert(node.id.clone(), i);

        // Initial position: either provided or random-ish based on hash
        let (x, y) = if let (Some(x), Some(y)) = (node.x, node.y) {
            (x, y)
        } else {
            // Deterministic pseudo-random based on id hash
            let hash = simple_hash(&node.id);
            let angle = (hash as f32) * 0.618033988749895;
            let radius = spread * ((i as f32) / n).sqrt();
            (
                radius * angle.cos(),
                radius * angle.sin() + (node.level as f32) * config.level_separation,
            )
        };

        sim_nodes.push(SimNode {
            id: node.id.clone(),
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            level: node.level,
        });
    }

    // Build edge list with validation
    let mut edge_list: Vec<(usize, usize, f32)> = Vec::new();
    for edge in &edges {
        let src = node_index
            .get(&edge.source)
            .ok_or_else(|| LayoutError::InvalidEdge(edge.source.clone()))?;
        let tgt = node_index
            .get(&edge.target)
            .ok_or_else(|| LayoutError::InvalidEdge(edge.target.clone()))?;
        edge_list.push((*src, *tgt, edge.weight.unwrap_or(1.0)));
    }

    // F8 fix: Build adjacency list for O(degree) instead of O(e) per node
    let mut adjacency: Vec<Vec<(usize, f32)>> = vec![Vec::new(); sim_nodes.len()];
    for &(src, tgt, weight) in &edge_list {
        adjacency[src].push((tgt, weight));
        adjacency[tgt].push((src, weight));
    }

    // Force simulation loop
    let theta = 0.8; // Barnes-Hut threshold
    let mut converged = false;
    let mut iterations_run = 0;

    for iter in 0..iterations {
        iterations_run = iter + 1;

        // Compute bounding box with minimum size (F3 fix)
        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;

        for node in &sim_nodes {
            min_x = min_x.min(node.x);
            min_y = min_y.min(node.y);
            max_x = max_x.max(node.x);
            max_y = max_y.max(node.y);
        }

        let padding = 100.0;
        // F3 fix: Ensure minimum bbox size
        let width = (max_x - min_x + 2.0 * padding).max(MIN_BBOX_SIZE);
        let height = (max_y - min_y + 2.0 * padding).max(MIN_BBOX_SIZE);
        let bounds = BoundingBox {
            x: min_x - padding,
            y: min_y - padding,
            width,
            height,
        };

        // Build quadtree
        let mut tree = QuadNode::new();
        for node in &sim_nodes {
            tree.insert(node.x, node.y, 1.0, bounds, 0);
        }

        // Compute forces
        let mut max_movement: f32 = 0.0; // F5 fix: use max instead of average

        for i in 0..sim_nodes.len() {
            let node = &sim_nodes[i];
            let mut fx = 0.0;
            let mut fy = 0.0;

            // Repulsion from quadtree
            let (rx, ry) = tree.compute_force(node.x, node.y, theta, config.repulsion);
            fx += rx;
            fy += ry;

            // F8 fix: Use adjacency list for O(degree) attraction
            for &(neighbor_idx, weight) in &adjacency[i] {
                let other = &sim_nodes[neighbor_idx];
                let dx = other.x - node.x;
                let dy = other.y - node.y;
                fx += config.attraction * weight * dx;
                fy += config.attraction * weight * dy;
            }

            // F4 fix: Stronger level-based vertical constraint (0.5 instead of 0.1)
            let target_y = (node.level as f32) * config.level_separation;
            let level_force = (target_y - node.y) * 0.5;
            fy += level_force;

            // Update velocity with damping
            let mut vx = (node.vx + fx) * config.damping;
            let mut vy = (node.vy + fy) * config.damping;

            // F9 fix: Clamp velocities to prevent NaN/Infinity
            if !vx.is_finite() {
                vx = 0.0;
            }
            if !vy.is_finite() {
                vy = 0.0;
            }
            const MAX_VELOCITY: f32 = 1000.0;
            vx = vx.clamp(-MAX_VELOCITY, MAX_VELOCITY);
            vy = vy.clamp(-MAX_VELOCITY, MAX_VELOCITY);

            // Store updated values
            sim_nodes[i].vx = vx;
            sim_nodes[i].vy = vy;
        }

        // Apply velocities
        for node in &mut sim_nodes {
            node.x += node.vx;
            node.y += node.vy;
            let movement = (node.vx * node.vx + node.vy * node.vy).sqrt();
            max_movement = max_movement.max(movement); // F5 fix
        }

        // F5 fix: Check convergence using max movement (size-independent)
        if max_movement < config.min_movement {
            converged = true;
            break;
        }
    }

    // Build result
    let positions: Vec<NodePosition> = sim_nodes
        .into_iter()
        .map(|n| NodePosition {
            id: n.id,
            x: n.x,
            y: n.y,
            level: n.level,
        })
        .collect();

    Ok(LayoutResult {
        positions,
        iterations_run,
        converged,
    })
}

/// Simple hash function for deterministic initial positions.
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
    fn test_empty_graph() {
        let result = compute_layout(vec![], vec![], LayoutConfig::default());
        assert!(matches!(result, Err(LayoutError::EmptyGraph)));
    }

    #[test]
    fn test_single_node() {
        let nodes = vec![NodeInput {
            id: "a".to_string(),
            x: None,
            y: None,
            level: 0,
        }];
        let result = compute_layout(nodes, vec![], LayoutConfig::default()).unwrap();
        assert_eq!(result.positions.len(), 1);
        assert_eq!(result.positions[0].id, "a");
    }

    #[test]
    fn test_connected_pair() {
        let nodes = vec![
            NodeInput {
                id: "a".to_string(),
                x: Some(0.0),
                y: Some(0.0),
                level: 0,
            },
            NodeInput {
                id: "b".to_string(),
                x: Some(1000.0),
                y: Some(0.0),
                level: 0,
            },
        ];
        let edges = vec![EdgeInput {
            source: "a".to_string(),
            target: "b".to_string(),
            weight: None,
        }];

        let result = compute_layout(nodes, edges, LayoutConfig::default()).unwrap();
        assert_eq!(result.positions.len(), 2);

        // After layout, nodes should be closer due to attraction
        let a = result.positions.iter().find(|p| p.id == "a").unwrap();
        let b = result.positions.iter().find(|p| p.id == "b").unwrap();
        let dist = ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt();
        assert!(dist < 1000.0, "Nodes should be attracted closer");
    }

    #[test]
    fn test_level_clustering() {
        let config = LayoutConfig {
            level_separation: 200.0,
            ..Default::default()
        };
        let nodes = vec![
            NodeInput {
                id: "root".to_string(),
                x: None,
                y: None,
                level: 0,
            },
            NodeInput {
                id: "child1".to_string(),
                x: None,
                y: None,
                level: 1,
            },
            NodeInput {
                id: "child2".to_string(),
                x: None,
                y: None,
                level: 1,
            },
            NodeInput {
                id: "grandchild".to_string(),
                x: None,
                y: None,
                level: 2,
            },
        ];
        let edges = vec![
            EdgeInput {
                source: "root".to_string(),
                target: "child1".to_string(),
                weight: None,
            },
            EdgeInput {
                source: "root".to_string(),
                target: "child2".to_string(),
                weight: None,
            },
            EdgeInput {
                source: "child1".to_string(),
                target: "grandchild".to_string(),
                weight: None,
            },
        ];

        let result = compute_layout(nodes, edges, config).unwrap();

        // Check level ordering
        let root = result.positions.iter().find(|p| p.id == "root").unwrap();
        let child1 = result.positions.iter().find(|p| p.id == "child1").unwrap();
        let grandchild = result
            .positions
            .iter()
            .find(|p| p.id == "grandchild")
            .unwrap();

        // Level 0 should have lower y than level 1, level 1 lower than level 2
        assert!(root.y < child1.y, "Root should be above children");
        assert!(
            child1.y < grandchild.y,
            "Children should be above grandchildren"
        );
    }

    #[test]
    fn test_invalid_edge() {
        let nodes = vec![NodeInput {
            id: "a".to_string(),
            x: None,
            y: None,
            level: 0,
        }];
        let edges = vec![EdgeInput {
            source: "a".to_string(),
            target: "nonexistent".to_string(),
            weight: None,
        }];

        let result = compute_layout(nodes, edges, LayoutConfig::default());
        assert!(matches!(result, Err(LayoutError::InvalidEdge(_))));
    }

    // F14 fix: Add stress test for 1000+ nodes
    #[test]
    fn test_large_graph_performance() {
        let n = 1000;
        let nodes: Vec<NodeInput> = (0..n)
            .map(|i| NodeInput {
                id: format!("node_{}", i),
                x: None,
                y: None,
                level: (i % 5) as u32,
            })
            .collect();

        // Create a sparse graph (each node connected to 2-3 neighbors)
        let edges: Vec<EdgeInput> = (0..n)
            .flat_map(|i| {
                let mut e = vec![];
                if i > 0 {
                    e.push(EdgeInput {
                        source: format!("node_{}", i),
                        target: format!("node_{}", i - 1),
                        weight: None,
                    });
                }
                if i > 10 {
                    e.push(EdgeInput {
                        source: format!("node_{}", i),
                        target: format!("node_{}", i - 10),
                        weight: None,
                    });
                }
                e
            })
            .collect();

        let config = LayoutConfig {
            iterations: 50, // Reduced for test speed
            ..Default::default()
        };

        let start = std::time::Instant::now();
        let result = compute_layout(nodes, edges, config).unwrap();
        let elapsed = start.elapsed();

        assert_eq!(result.positions.len(), n);
        // Should complete in reasonable time (< 5 seconds even in debug mode)
        assert!(
            elapsed.as_secs() < 5,
            "Layout took too long: {:?}",
            elapsed
        );

        // Verify all positions are finite
        for pos in &result.positions {
            assert!(pos.x.is_finite(), "Position x is not finite");
            assert!(pos.y.is_finite(), "Position y is not finite");
        }
    }

    // F1/F3 fix: Test nodes at same position
    #[test]
    fn test_nodes_at_same_position() {
        let nodes: Vec<NodeInput> = (0..100)
            .map(|i| NodeInput {
                id: format!("node_{}", i),
                x: Some(0.0),
                y: Some(0.0),
                level: 0,
            })
            .collect();

        let result = compute_layout(nodes, vec![], LayoutConfig::default()).unwrap();

        // All positions should be finite (no NaN/Infinity)
        for pos in &result.positions {
            assert!(pos.x.is_finite(), "Position x is not finite");
            assert!(pos.y.is_finite(), "Position y is not finite");
        }
    }

    // F11 fix: Test iteration cap
    #[test]
    fn test_iteration_cap() {
        let nodes = vec![NodeInput {
            id: "a".to_string(),
            x: None,
            y: None,
            level: 0,
        }];

        let config = LayoutConfig {
            iterations: u32::MAX, // Try to DoS
            min_movement: 0.0,    // Never converge
            ..Default::default()
        };

        let result = compute_layout(nodes, vec![], config).unwrap();
        // Should be capped at MAX_ITERATIONS
        assert!(
            result.iterations_run <= MAX_ITERATIONS,
            "Iterations not capped"
        );
    }
}
