"use client";
import { GREEN, cardStyle } from "@/lib/theme";
import { ils } from "@/lib/format";
import { Sec, Row, EditableNum } from "@/lib/ui";
import { ASSET_KEYS, assetsTotal } from "./model";

export default function Assets({ d, upd }) {
  const total = assetsTotal(d.assets);
  return (
    <div>
      <Sec title="נכסים לפי אפיק" />
      <div style={cardStyle}>
        {ASSET_KEYS.map(({ k, l }) => (
          <Row key={k} label={l}>
            <EditableNum value={d.assets[k] || 0} onChange={v => upd(`assets.${k}`, v)} />
          </Row>
        ))}
        <Row last label="שווי נקי" bold>
          <span style={{ fontSize: 17, color: GREEN }}>{ils(total)}</span>
        </Row>
      </div>
    </div>
  );
}
