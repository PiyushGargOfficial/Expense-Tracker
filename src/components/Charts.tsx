"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899", "#64748b"];

export function CategoryPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div role="img" aria-label="Spending by category" className="h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={90} label={(d) => d.name}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthBars({ data }: { data: { month: string; value: number }[] }) {
  return (
    <div role="img" aria-label="Spending by month" className="h-64">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Budget (grey) next to what's been used this month (green, amber near the limit, red when over). */
export function BudgetBars({ data, currency }: { data: { name: string; budget: number; used: number }[]; currency: string }) {
  const money = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
  // Compact axis labels ("$3K") so they don't collide on a phone-width chart.
  const tick = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
  const colorFor = (d: { budget: number; used: number }) => (d.used > d.budget ? "#dc2626" : d.used === d.budget ? "#f59e0b" : "#10b981");
  return (
    <div role="img" aria-label="Budget compared with amount used, by category" style={{ height: Math.max(220, data.length * 70 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => tick(v as number)} />
          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => money(Number(v))} />
          <Legend />
          <Bar dataKey="budget" name="Budget" fill="#94a3b8" radius={[0, 4, 4, 0]} />
          <Bar dataKey="used" name="Used" fill="#10b981" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={colorFor(d)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
