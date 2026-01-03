//! Indexes: labels, properties, adjacency (in-memory MVP)

#[cfg(feature = "fs")]
pub mod persistence;

use crate::types::EngineError;
use crate::exec::executor::Value;
use std::collections::HashMap;

pub type NodeId = u64;
pub type EdgeId = u64;

#[derive(Debug, Clone)]
pub struct Node {
    pub id: NodeId,
    pub labels: Vec<String>,
    pub properties: HashMap<String, Value>,
}

#[derive(Debug, Clone)]
pub struct Edge {
    pub id: EdgeId,
    pub from_node: NodeId,
    pub to_node: NodeId,
    pub edge_type: String,
    pub properties: HashMap<String, Value>,
}

/// Read-only graph storage interface
pub trait GraphReadStore {
    fn scan_all(&self) -> Result<Vec<Node>, EngineError>;
    fn scan_by_label(&self, label: &str) -> Result<Vec<Node>, EngineError>;
    fn get_node(&self, id: NodeId) -> Result<Option<Node>, EngineError>;
    fn get_neighbors(&self, node_id: NodeId, edge_type: Option<&str>) -> Result<Vec<(Edge, Node)>, EngineError>;
    fn get_neighbors_incoming(&self, node_id: NodeId, edge_type: Option<&str>) -> Result<Vec<(Edge, Node)>, EngineError>;
}

/// Write-capable storage interface (extends read)
pub trait GraphWriteStore: GraphReadStore {
    fn add_node(&mut self, labels: Vec<String>, properties: HashMap<String, Value>) -> Result<NodeId, EngineError>;
    fn add_edge(&mut self, from: NodeId, to: NodeId, edge_type: String, properties: HashMap<String, Value>) -> Result<EdgeId, EngineError>;
}

/// In-memory graph store with indexes
pub struct InMemoryGraphStore {
    pub(crate) nodes: HashMap<NodeId, Node>,
    pub(crate) edges: HashMap<EdgeId, Edge>,
    pub(crate) label_index: HashMap<String, Vec<NodeId>>,
    pub(crate) adjacency_out: HashMap<NodeId, Vec<EdgeId>>,
    pub(crate) adjacency_in: HashMap<NodeId, Vec<EdgeId>>,
    pub(crate) next_node_id: NodeId,
    pub(crate) next_edge_id: EdgeId,
}

impl InMemoryGraphStore {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            label_index: HashMap::new(),
            adjacency_out: HashMap::new(),
            adjacency_in: HashMap::new(),
            next_node_id: 1,
            next_edge_id: 1,
        }
    }
}

impl GraphReadStore for InMemoryGraphStore {
    fn scan_all(&self) -> Result<Vec<Node>, EngineError> {
        Ok(self.nodes.values().cloned().collect())
    }

    fn scan_by_label(&self, label: &str) -> Result<Vec<Node>, EngineError> {
        if let Some(node_ids) = self.label_index.get(label) {
            Ok(node_ids.iter()
                .filter_map(|id| self.nodes.get(id).cloned())
                .collect())
        } else {
            Ok(Vec::new())
        }
    }

    fn get_node(&self, id: NodeId) -> Result<Option<Node>, EngineError> {
        Ok(self.nodes.get(&id).cloned())
    }

    fn get_neighbors(&self, node_id: NodeId, edge_type: Option<&str>) -> Result<Vec<(Edge, Node)>, EngineError> {
        let mut result = Vec::new();

        if let Some(edge_ids) = self.adjacency_out.get(&node_id) {
            for edge_id in edge_ids {
                if let Some(edge) = self.edges.get(edge_id) {
                    if let Some(et) = edge_type {
                        if edge.edge_type != et {
                            continue;
                        }
                    }
                    if let Some(node) = self.nodes.get(&edge.to_node) {
                        result.push((edge.clone(), node.clone()));
                    }
                }
            }
        }

        Ok(result)
    }

    fn get_neighbors_incoming(&self, node_id: NodeId, edge_type: Option<&str>) -> Result<Vec<(Edge, Node)>, EngineError> {
        let mut result = Vec::new();

        if let Some(edge_ids) = self.adjacency_in.get(&node_id) {
            for edge_id in edge_ids {
                if let Some(edge) = self.edges.get(edge_id) {
                    if let Some(et) = edge_type {
                        if edge.edge_type != et {
                            continue;
                        }
                    }
                    if let Some(node) = self.nodes.get(&edge.from_node) {
                        result.push((edge.clone(), node.clone()));
                    }
                }
            }
        }

        Ok(result)
    }
}

impl GraphWriteStore for InMemoryGraphStore {
    fn add_node(&mut self, labels: Vec<String>, properties: HashMap<String, Value>) -> Result<NodeId, EngineError> {
        let id = self.next_node_id;
        self.next_node_id += 1;

        let node = Node { id, labels: labels.clone(), properties };
        self.nodes.insert(id, node);

        // Update label index
        for label in labels {
            self.label_index.entry(label).or_insert_with(Vec::new).push(id);
        }

        Ok(id)
    }

    fn add_edge(&mut self, from: NodeId, to: NodeId, edge_type: String, properties: HashMap<String, Value>) -> Result<EdgeId, EngineError> {
        let id = self.next_edge_id;
        self.next_edge_id += 1;

        let edge = Edge {
            id,
            from_node: from,
            to_node: to,
            edge_type,
            properties,
        };
        self.edges.insert(id, edge);

        // Update adjacency indexes
        self.adjacency_out.entry(from).or_insert_with(Vec::new).push(id);
        self.adjacency_in.entry(to).or_insert_with(Vec::new).push(id);

        Ok(id)
    }
}
