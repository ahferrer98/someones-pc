import { useState } from "react";
import { CardThumb } from "./CardThumb";

export function EditableCardThumb({ card, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(card.imageUrl || "");

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 150 }} onClick={(e) => e.stopPropagation()}>
        <input
          className="binder-input"
          style={{ fontSize: 11, padding: "4px 6px" }}
          placeholder="Paste image URL"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="binder-btn"
            style={{ padding: "3px 8px", fontSize: 11.5 }}
            onClick={() => {
              onSave(val.trim());
              setEditing(false);
            }}
          >
            Save
          </button>
          <button className="binder-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ cursor: "pointer" }} onClick={() => setEditing(true)} title="Click to paste a direct image URL">
      <CardThumb card={card} />
    </div>
  );
}
