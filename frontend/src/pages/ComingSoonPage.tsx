import { Construction } from 'lucide-react';

export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <Construction className="h-10 w-10 text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-500">This module is not built yet.</p>
    </div>
  );
}
