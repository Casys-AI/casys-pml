# Stop Visualizing Tools. Start Visualizing Skills.

**Author:** AgentCards Team
**Date:** December 2025
**Topics:** Data Visualization, Hypergraphs, AI Architecture

---

We love our knowledge graphs. Nodes are tools, edges are connections. Simple.
But when we started building autonomous agents, we hit a wall.

A "skill" (like deploying to production) isn't a connection between A and B. It's a complex recipe involving 5, 10, or 20 tools working in concert.
Standard graphs can't show this. They show the ingredients, not the recipe.

That's why we're moving to **Hypergraphs** (ADR-029).

In a Hypergraph, an edge can connect any number of nodes.

- **Old Graph:** A links to B.
- **Hypergraph:** A, B, C, D, and E form a single "Hyperedge" -> The "Deploy" Capability.

## Why does this matter?

Because when you can visualize the _group_, you can manage the _skill_. You can see which tools form the "Data Analysis" cluster vs the "System Ops" cluster. You can verify if your agent is learning the right things.

We're using Cytoscape.js compound nodes to bring this to life. Because you can't improve what you can't see.

## Visual Concept

```text
   STANDARD GRAPH (The Ingredients)
   [GitHub] --- [Filesystem] --- [Slack]
       \           /
        \         /
         [Database]

   VS

   HYPERGRAPH (The Recipe/Skill)

   +------------------------------------------+
   |  CAPABILITY: "Emergency Hotfix"          |
   |                                          |
   |  [GitHub] <---> [Filesystem]             |
   |      \              /                    |
   |       \            /                     |
   |        [Database]                        |
   |             |                            |
   |             v                            |
   |          [Slack]                         |
   |                                          |
   +------------------------------------------+
```

#DataViz #Hypergraphs #AI #SystemArchitecture #AgentCards
