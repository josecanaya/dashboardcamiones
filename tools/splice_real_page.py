from pathlib import Path

repo = Path(__file__).resolve().parent.parent
p = repo / "src/pages/RealJourneyDiagnosticsPage.tsx"
t = p.read_text(encoding="utf-8")
start = t.find('<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">')
end = t.rfind("\n    </div>\n  )")
print("start", start, "end", end)
if start >= 0 and end > start:
    print(t[end : end + 30])
