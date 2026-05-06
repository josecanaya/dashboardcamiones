from pathlib import Path

repo = Path(__file__).resolve().parent.parent
page = repo / "src/pages/RealJourneyDiagnosticsPage.tsx"
text = page.read_text(encoding="utf-8")
needle = "    <div className=\"flex min-h-0 flex-1 flex-col gap-4 overflow-auto\">"
start = text.find(needle)
close = "\n    </div>\n  )"
end = text.rfind(close)
if start < 0 or end < 0:
    raise SystemExit(f"markers not found start={start} end={end}")
suffix = text[end + len(close) :]

view_block = """    <RealJourneyDiagnosticsView
      loading={loading}
      error={error}
      dataSource={dataSource}
      setDataSource={setDataSource}
      apiStartDate={apiStartDate}
      apiEndDate={apiEndDate}
      setApiStartDate={setApiStartDate}
      setApiEndDate={setApiEndDate}
      filePath={filePath}
      setFilePath={setFilePath}
      load={load}
      includeInvalidPlateDiagnostics={includeInvalidPlateDiagnostics}
      setIncludeInvalidPlateDiagnostics={setIncludeInvalidPlateDiagnostics}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      calendarDayOptions={calendarDayOptions}
      calendarDayPickerIndex={calendarDayPickerIndex}
      eventCountByCalendarDay={eventCountByCalendarDay}
      formatCalendarDayOptionLabel={formatCalendarDayOptionLabel}
      eventMinDay={eventMinDay}
      eventMaxDay={eventMaxDay}
      prelimCircuitFilter={prelimCircuitFilter}
      setPrelimCircuitFilter={setPrelimCircuitFilter}
      journeyQuickFilter={journeyQuickFilter}
      setJourneyQuickFilter={setJourneyQuickFilter}
      depurationScopeFilter={depurationScopeFilter}
      setDepurationScopeFilter={setDepurationScopeFilter}
      onlyThisPlateScope={onlyThisPlateScope}
      setOnlyThisPlateScope={setOnlyThisPlateScope}
      plateQuery={plateQuery}
      setPlateQuery={setPlateQuery}
      plateNorm={plateNorm}
      interplantWindowHours={interplantWindowHours}
      setInterplantWindowHours={setInterplantWindowHours}
      mainTab={mainTab}
      setMainTab={setMainTab}
      journeys={journeys}
      events={events}
      plateQualitySummary={plateQualitySummary}
      depurationSnapshot={depurationSnapshot}
      donutJourneys={donutJourneys}
      prelimCircuitCardMetrics={prelimCircuitCardMetrics}
      circuitBarItems={circuitBarItems}
      circuitSummaryRows={circuitSummaryRows}
      cameraCoverageSummary={cameraCoverageSummary}
      cameraStatusCounts={cameraStatusCounts}
      topInvalidPlateReading={topInvalidPlateReading}
      plateEventsAll={plateEventsAll}
      plateJourneysFull={plateJourneysFull}
      plateSummary={plateSummary}
      plateQueryFormatWarning={plateQueryFormatWarning}
      plateTimelineRows={plateTimelineRows}
      interplantHintsForPlate={interplantHintsForPlate}
      plateMilestoneTimeline={plateMilestoneTimeline}
      downloadPlateCsv={downloadPlateCsv}
      incompleteGroups={incompleteGroups}
      incompleteTotal={incompleteTotal}
      incompleteRankings={incompleteRankings}
      depurationExecutiveRows={depurationExecutiveRows}
      topDiscardInfo={topDiscardInfo}
      integrityLabel={integrityLabel}
      datasetQualityBadge={datasetQualityBadge}
      filteredJourneys={filteredJourneys}
      filteredPlateRows={filteredPlateRows}
      prelimCircuitDailyFiltered={prelimCircuitDailyFiltered}
      drawerCircuitCode={drawerCircuitCode}
      setDrawerCircuitCode={setDrawerCircuitCode}
      drawerCircuitJourneys={drawerCircuitJourneys}
      drawerIncompleteGroup={drawerIncompleteGroup}
      setDrawerIncompleteGroup={setDrawerIncompleteGroup}
    />
"""

new_text = text[:start] + view_block + suffix
page.write_text(new_text, encoding="utf-8")
print("ok", len(text), "->", len(new_text))
print("suffix head", repr(suffix[:20]))
