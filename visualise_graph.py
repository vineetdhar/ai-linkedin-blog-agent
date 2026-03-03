# visualise_graph.py
# Run this to see a visual diagram of the LangGraph agent
# pip install langgraph langchain-anthropic IPython

from langgraph.graph import StateGraph, END
from typing import TypedDict, List

# ── Define the state ────────────────────────────────────────────
class AgentState(TypedDict):
    topics: List[dict]
    post: str
    approved: bool

# ── Define stub nodes (just for visualisation) ──────────────────
def researcher(state): return state
def curator(state):    return state
def writer(state):     return state
def reviewer(state):   return state
def publisher(state):  return state

# ── Build the graph ─────────────────────────────────────────────
builder = StateGraph(AgentState)

builder.add_node("researcher", researcher)
builder.add_node("curator",    curator)
builder.add_node("writer",     writer)
builder.add_node("reviewer",   reviewer)
builder.add_node("publisher",  publisher)

builder.set_entry_point("researcher")
builder.add_edge("researcher", "curator")
builder.add_edge("curator",    "writer")
builder.add_edge("writer",     "reviewer")
builder.add_edge("reviewer",   "publisher")
builder.add_edge("publisher",  END)

graph = builder.compile()

# ── Option 1: Save as PNG ────────────────────────────────────────
try:
    png = graph.get_graph().draw_mermaid_png()
    with open("agent_graph.png", "wb") as f:
        f.write(png)
    print("✅ Saved as agent_graph.png — open it to see the diagram")
except Exception as e:
    print(f"PNG export needs extra deps: {e}")

# ── Option 2: Print Mermaid diagram (paste into mermaid.live) ────
print("\n── Mermaid diagram (paste at mermaid.live) ──────────────")
print(graph.get_graph().draw_mermaid())
