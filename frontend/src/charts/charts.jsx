import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// Validated categorical slots 1–3 (blue / orange / aqua). Fixed meaning across the whole app.
export const SERIES = {
  know: { key: 'know', label: 'Already know', color: '#2a78d6' },
  learning: { key: 'learning', label: 'Currently learning', color: '#1baf7a' },
  gap: { key: 'gap', label: 'Remaining gap', color: '#eb6834' },
};
const AXIS = { fontSize: 12, fill: '#5b6472' };
const GRID = '#e8ebf0';

function TooltipBox({ title, rows }) {
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{title}</div>
      {rows.map((r) => (
        <div className="tt-row" key={r.label}>
          {r.color && <span className="tt-swatch" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

const StackTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <TooltipBox
      title={label}
      rows={Object.values(SERIES).map((s) => ({ label: s.label, color: s.color, value: payload[0].payload[s.key] }))}
    />
  ) : null;

/** All skills: already know / currently learning / remaining gap, stacked. Click a bar to open the skill. */
export function SkillWorkforceChart({ data, onSelect, height }) {
  const h = height || Math.max(260, data.length * 30 + 60);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap={7}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false}
          label={{ value: 'People', position: 'insideBottomRight', offset: -2, ...AXIS }} />
        <YAxis type="category" dataKey="name" width={132} tick={{ ...AXIS, fill: '#1f2633' }} axisLine={false} tickLine={false} />
        <Tooltip content={<StackTooltip />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
        <Legend verticalAlign="top" align="left" iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
        {Object.values(SERIES).map((s, i, arr) => (
          <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.label} stackId="w" fill={s.color} stroke="#fff" strokeWidth={2}
            radius={i === arr.length - 1 ? [0, 4, 4, 0] : 0} cursor="pointer"
            onClick={(d) => onSelect?.(d.payload?.id ?? d.id)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single skill: three bars with direct labels. */
export function SkillBreakdownChart({ know, learning, gap }) {
  const data = [
    { ...SERIES.know, value: know },
    { ...SERIES.learning, value: learning },
    { ...SERIES.gap, value: gap ?? 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ ...AXIS, fill: '#1f2633' }} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }}
          content={({ active, payload }) => active && payload?.length
            ? <TooltipBox title={payload[0].payload.label} rows={[{ label: 'People', value: payload[0].value, color: payload[0].payload.color }]} />
            : null} />
        <Bar isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={72}>
          {data.map((d) => <Cell key={d.key} fill={d.color} />)}
          <LabelList dataKey="value" position="top" style={{ fontSize: 13, fontWeight: 600, fill: '#1f2633' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Historical demand + ML forecast point (dashed). One axis: people required. */
export function DemandTrendChart({ history, forecast }) {
  const data = history.map((h) => ({ quarter: h.quarter, actual: h.required_people }));
  if (forecast && data.length) {
    data[data.length - 1].forecast = data[data.length - 1].actual;
    data.push({ quarter: forecast.quarter, forecast: forecast.required_people });
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="quarter" tick={{ ...AXIS, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={({ active, payload, label }) => active && payload?.length
          ? <TooltipBox title={label} rows={payload.filter((p) => p.value != null).slice(-1).map((p) => ({
              label: p.dataKey === 'forecast' && label === forecast?.quarter ? 'Forecast (ML)' : 'Required (history)',
              value: p.value, color: p.color }))} />
          : null} />
        <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 6 }} />
        <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Historical demand" stroke="#2a78d6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        <Line isAnimationActive={false} type="monotone" dataKey="forecast" name="Forecast" stroke="#eb6834" strokeWidth={2} strokeDasharray="5 4"
          dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Top remaining shortages (single series). */
export function ShortageChart({ data, onSelect }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 8, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="skill_name" width={132} tick={{ ...AXIS, fill: '#1f2633' }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(235,104,52,0.06)' }}
          content={({ active, payload, label }) => active && payload?.length
            ? <TooltipBox title={label} rows={[
                { label: 'Forecast required', value: payload[0].payload.required_people },
                { label: 'Remaining gap', value: payload[0].value, color: SERIES.gap.color }]} />
            : null} />
        <Bar isAnimationActive={false} dataKey="remaining_shortage" fill={SERIES.gap.color} radius={[0, 4, 4, 0]} cursor="pointer"
          onClick={(d) => onSelect?.(d.payload?.skill_id ?? d.skill_id)}>
          <LabelList dataKey="remaining_shortage" position="right" style={{ fontSize: 12, fontWeight: 600, fill: '#1f2633' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
