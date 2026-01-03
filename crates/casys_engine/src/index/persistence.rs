//! Persistence: flush/load graph index depuis segments

use super::{InMemoryGraphStore, Node, Edge, NodeId, EdgeId};
use crate::exec::executor::Value;
use crate::types::{EngineError, DatabaseName, BranchName};
use casys_storage_fs::catalog;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

/// WAL record pour mutations graph
#[derive(Debug, Clone)]
pub enum WalRecord {
    AddNode {
        id: NodeId,
        labels: Vec<String>,
        properties: HashMap<String, Value>,
    },
    AddEdge {
        id: EdgeId,
        from_node: NodeId,
        to_node: NodeId,
        edge_type: String,
        properties: HashMap<String, Value>,
    },
}

impl WalRecord {
    /// Sérialise le record en bytes (format simple: type(1) + JSON)
    pub fn to_bytes(&self) -> Vec<u8> {
        let json = match self {
            WalRecord::AddNode { id, labels, properties } => {
                serde_json::json!({
                    "type": "add_node",
                    "id": id,
                    "labels": labels,
                    "properties": serialize_props(properties)
                })
            }
            WalRecord::AddEdge { id, from_node, to_node, edge_type, properties } => {
                serde_json::json!({
                    "type": "add_edge",
                    "id": id,
                    "from": from_node,
                    "to": to_node,
                    "edge_type": edge_type,
                    "properties": serialize_props(properties)
                })
            }
        };
        serde_json::to_vec(&json).unwrap_or_default()
    }

    /// Désérialise depuis bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, EngineError> {
        let json: serde_json::Value = serde_json::from_slice(data)
            .map_err(|e| EngineError::StorageIo(format!("WAL record parse: {}", e)))?;
        
        let rec_type = json["type"].as_str()
            .ok_or_else(|| EngineError::StorageIo("missing type".into()))?;
        
        match rec_type {
            "add_node" => {
                let id = json["id"].as_u64().unwrap_or(0);
                let labels: Vec<String> = serde_json::from_value(json["labels"].clone())
                    .unwrap_or_default();
                let properties = deserialize_props(&json["properties"])?;
                Ok(WalRecord::AddNode { id, labels, properties })
            }
            "add_edge" => {
                let id = json["id"].as_u64().unwrap_or(0);
                let from_node = json["from"].as_u64().unwrap_or(0);
                let to_node = json["to"].as_u64().unwrap_or(0);
                let edge_type = json["edge_type"].as_str().unwrap_or("").to_string();
                let properties = deserialize_props(&json["properties"])?;
                Ok(WalRecord::AddEdge { id, from_node, to_node, edge_type, properties })
            }
            _ => Err(EngineError::StorageIo(format!("unknown WAL record type: {}", rec_type))),
        }
    }
}

fn serialize_props(props: &HashMap<String, Value>) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    for (k, v) in props {
        m.insert(k.clone(), v.to_json());
    }
    serde_json::Value::Object(m)
}

fn deserialize_props(json: &serde_json::Value) -> Result<HashMap<String, Value>, EngineError> {
    let mut props = HashMap::new();
    if let Some(obj) = json.as_object() {
        for (k, v) in obj {
            if let Some(val) = Value::from_json(v) {
                props.insert(k.clone(), val);
            }
        }
    }
    Ok(props)
}

impl InMemoryGraphStore {
    /// Flush le graph vers des segments
    pub fn flush_to_segments(&self, root: &Path, db: &DatabaseName, branch: &BranchName) -> Result<(), EngineError> {
        let segments_dir = catalog::branch_dir(root, db, branch).join("segments");
        fs::create_dir_all(&segments_dir)
            .map_err(|e| EngineError::StorageIo(format!("create segments dir: {}", e)))?;

        // Écrire nodes.seg
        let nodes_path = segments_dir.join("nodes.seg");
        self.write_nodes_segment(&nodes_path)?;

        // Écrire edges.seg
        let edges_path = segments_dir.join("edges.seg");
        self.write_edges_segment(&edges_path)?;

        Ok(())
    }

    fn write_nodes_segment(&self, path: &Path) -> Result<(), EngineError> {
        let mut file = File::create(path)
            .map_err(|e| EngineError::StorageIo(format!("create nodes.seg: {}", e)))?;

        // Format simple: JSON array
        let nodes: Vec<_> = self.nodes.values().collect();
        let json = serde_json::json!({
            "count": nodes.len(),
            "nodes": nodes.iter().map(|n| {
                serde_json::json!({
                    "id": n.id,
                    "labels": n.labels,
                    "properties": serialize_props(&n.properties)
                })
            }).collect::<Vec<_>>()
        });

        let data = serde_json::to_vec(&json)
            .map_err(|e| EngineError::StorageIo(format!("serialize nodes: {}", e)))?;
        file.write_all(&data)
            .map_err(|e| EngineError::StorageIo(format!("write nodes.seg: {}", e)))?;
        file.sync_all()
            .map_err(|e| EngineError::StorageIo(format!("fsync nodes.seg: {}", e)))?;

        Ok(())
    }

    fn write_edges_segment(&self, path: &Path) -> Result<(), EngineError> {
        let mut file = File::create(path)
            .map_err(|e| EngineError::StorageIo(format!("create edges.seg: {}", e)))?;

        let edges: Vec<_> = self.edges.values().collect();
        let json = serde_json::json!({
            "count": edges.len(),
            "edges": edges.iter().map(|e| {
                serde_json::json!({
                    "id": e.id,
                    "from": e.from_node,
                    "to": e.to_node,
                    "type": e.edge_type,
                    "properties": serialize_props(&e.properties)
                })
            }).collect::<Vec<_>>()
        });

        let data = serde_json::to_vec(&json)
            .map_err(|e| EngineError::StorageIo(format!("serialize edges: {}", e)))?;
        file.write_all(&data)
            .map_err(|e| EngineError::StorageIo(format!("write edges.seg: {}", e)))?;
        file.sync_all()
            .map_err(|e| EngineError::StorageIo(format!("fsync edges.seg: {}", e)))?;

        Ok(())
    }

    /// Load le graph depuis des segments
    pub fn load_from_segments(root: &Path, db: &DatabaseName, branch: &BranchName) -> Result<Self, EngineError> {
        let segments_dir = catalog::branch_dir(root, db, branch).join("segments");
        
        let mut store = Self::new();

        // Charger nodes.seg si existe
        let nodes_path = segments_dir.join("nodes.seg");
        if nodes_path.exists() {
            store.load_nodes_segment(&nodes_path)?;
        }

        // Charger edges.seg si existe
        let edges_path = segments_dir.join("edges.seg");
        if edges_path.exists() {
            store.load_edges_segment(&edges_path)?;
        }

        Ok(store)
    }

    fn load_nodes_segment(&mut self, path: &Path) -> Result<(), EngineError> {
        let mut file = File::open(path)
            .map_err(|e| EngineError::StorageIo(format!("open nodes.seg: {}", e)))?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|e| EngineError::StorageIo(format!("read nodes.seg: {}", e)))?;

        let json: serde_json::Value = serde_json::from_slice(&data)
            .map_err(|e| EngineError::StorageIo(format!("parse nodes.seg: {}", e)))?;

        if let Some(nodes_array) = json["nodes"].as_array() {
            for node_json in nodes_array {
                let id = node_json["id"].as_u64().unwrap_or(0);
                let labels: Vec<String> = serde_json::from_value(node_json["labels"].clone())
                    .unwrap_or_default();
                let properties = deserialize_props(&node_json["properties"])?;

                let node = Node { id, labels: labels.clone(), properties };
                self.nodes.insert(id, node);

                // Rebuild label index
                for label in labels {
                    self.label_index.entry(label).or_insert_with(Vec::new).push(id);
                }

                // Update next_node_id
                if id >= self.next_node_id {
                    self.next_node_id = id + 1;
                }
            }
        }

        Ok(())
    }

    fn load_edges_segment(&mut self, path: &Path) -> Result<(), EngineError> {
        let mut file = File::open(path)
            .map_err(|e| EngineError::StorageIo(format!("open edges.seg: {}", e)))?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|e| EngineError::StorageIo(format!("read edges.seg: {}", e)))?;

        let json: serde_json::Value = serde_json::from_slice(&data)
            .map_err(|e| EngineError::StorageIo(format!("parse edges.seg: {}", e)))?;

        if let Some(edges_array) = json["edges"].as_array() {
            for edge_json in edges_array {
                let id = edge_json["id"].as_u64().unwrap_or(0);
                let from_node = edge_json["from"].as_u64().unwrap_or(0);
                let to_node = edge_json["to"].as_u64().unwrap_or(0);
                let edge_type = edge_json["type"].as_str().unwrap_or("").to_string();
                let properties = deserialize_props(&edge_json["properties"])?;

                let edge = Edge { id, from_node, to_node, edge_type, properties };
                self.edges.insert(id, edge);

                // Rebuild adjacency indexes
                self.adjacency_out.entry(from_node).or_insert_with(Vec::new).push(id);
                self.adjacency_in.entry(to_node).or_insert_with(Vec::new).push(id);

                // Update next_edge_id
                if id >= self.next_edge_id {
                    self.next_edge_id = id + 1;
                }
            }
        }

        Ok(())
    }

    /// Rejouer des WAL records
    pub fn replay_wal(&mut self, records: &[WalRecord]) -> Result<(), EngineError> {
        for record in records {
            match record {
                WalRecord::AddNode { id, labels, properties } => {
                    let node = Node {
                        id: *id,
                        labels: labels.clone(),
                        properties: properties.clone(),
                    };
                    self.nodes.insert(*id, node);
                    
                    // Update indexes
                    for label in labels {
                        self.label_index.entry(label.clone()).or_insert_with(Vec::new).push(*id);
                    }
                    
                    if *id >= self.next_node_id {
                        self.next_node_id = id + 1;
                    }
                }
                WalRecord::AddEdge { id, from_node, to_node, edge_type, properties } => {
                    let edge = Edge {
                        id: *id,
                        from_node: *from_node,
                        to_node: *to_node,
                        edge_type: edge_type.clone(),
                        properties: properties.clone(),
                    };
                    self.edges.insert(*id, edge);
                    
                    // Update adjacency
                    self.adjacency_out.entry(*from_node).or_insert_with(Vec::new).push(*id);
                    self.adjacency_in.entry(*to_node).or_insert_with(Vec::new).push(*id);
                    
                    if *id >= self.next_edge_id {
                        self.next_edge_id = id + 1;
                    }
                }
            }
        }
        Ok(())
    }
}
