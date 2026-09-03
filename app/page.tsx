"use client";

import { useMemo, useState } from "react";
import {
  hardersCapacity,
  vehiclesAcceptedInGap,
  type GapAcceptanceParameters,
} from "../lib/traffic";

type Vehicle = { id: number; headway: number; arrival: number; minorVehicles: number };
type RunSummary = {
  run: number;
  vehicleCount: number;
  meanHeadway: number;
  minorVehicleCount: number;
  usableGapCount: number;
};
type HeadwayBin = {
  from: number;
  to: number | null;
  count: number;
  observedPercent: number;
  theoreticalPercent: number;
};
type BatchResult = {
  summaries: RunSummary[];
  lastVehicles: Vehicle[];
  headwayBins: HeadwayBin[];
  totalHeadways: number;
  totalMinorVehicles: number;
  totalUsableGaps: number;
};

type ResultInputs = {
  volume: number;
  duration: number;
  runs: number;
  criticalGap: number | null;
  followUpTime: number | null;
};

const DEFAULT_VOLUME = 500;
const DEFAULT_DURATION = 1;
const DEFAULT_RUNS = 20;

function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateRun(
  volume: number,
  hours: number,
  random: () => number,
  keepVehicles: boolean,
  recordHeadway: (headway: number) => void,
  gapAcceptance: GapAcceptanceParameters | null,
) {
  const vehicles: Vehicle[] = [];
  const horizon = hours * 3600;
  let arrival = 0;
  let vehicleCount = 0;
  let totalHeadway = 0;
  let minorVehicleCount = 0;
  let usableGapCount = 0;

  while (true) {
    // Exponential headways model a Poisson arrival process.
    const u = Math.max(random(), Number.EPSILON);
    const headway = (-Math.log(u) * 3600) / volume;
    if (arrival + headway > horizon) break;
    arrival += headway;
    vehicleCount += 1;
    totalHeadway += headway;
    recordHeadway(headway);
    const minorVehicles = gapAcceptance
      ? vehiclesAcceptedInGap(headway, gapAcceptance.criticalGap, gapAcceptance.followUpTime)
      : 0;
    minorVehicleCount += minorVehicles;
    if (minorVehicles > 0) usableGapCount += 1;
    if (keepVehicles) vehicles.push({ id: vehicleCount, headway, arrival, minorVehicles });
  }

  return {
    vehicles,
    vehicleCount,
    meanHeadway: vehicleCount ? totalHeadway / vehicleCount : 0,
    minorVehicleCount,
    usableGapCount,
  };
}

function simulateBatch(
  volume: number,
  hours: number,
  numberOfRuns: number,
  random = Math.random,
  gapAcceptance: GapAcceptanceParameters | null = null,
): BatchResult {
  const summaries: RunSummary[] = [];
  let lastVehicles: Vehicle[] = [];
  const theoreticalMean = 3600 / volume;
  const headwayBinWidth = theoreticalMean / 2;
  const headwayCounts = Array.from({ length: 12 }, () => 0);
  let totalHeadways = 0;
  let totalMinorVehicles = 0;
  let totalUsableGaps = 0;

  const recordHeadway = (headway: number) => {
    const index = Math.min(headwayCounts.length - 1, Math.floor(headway / headwayBinWidth));
    headwayCounts[index] += 1;
    totalHeadways += 1;
  };

  for (let run = 1; run <= numberOfRuns; run += 1) {
    const result = simulateRun(volume, hours, random, run === numberOfRuns, recordHeadway, gapAcceptance);
    summaries.push({
      run,
      vehicleCount: result.vehicleCount,
      meanHeadway: result.meanHeadway,
      minorVehicleCount: result.minorVehicleCount,
      usableGapCount: result.usableGapCount,
    });
    totalMinorVehicles += result.minorVehicleCount;
    totalUsableGaps += result.usableGapCount;
    if (run === numberOfRuns) lastVehicles = result.vehicles;
  }

  const headwayBins = headwayCounts.map((count, index) => {
    const from = index * headwayBinWidth;
    const to = index === headwayCounts.length - 1 ? null : (index + 1) * headwayBinWidth;
    const theoreticalPercent = 100 * (
      to === null
        ? Math.exp(-from / theoreticalMean)
        : Math.exp(-from / theoreticalMean) - Math.exp(-to / theoreticalMean)
    );
    return {
      from,
      to,
      count,
      observedPercent: totalHeadways ? (count / totalHeadways) * 100 : 0,
      theoreticalPercent,
    };
  });

  return {
    summaries,
    lastVehicles,
    headwayBins,
    totalHeadways,
    totalMinorVehicles,
    totalUsableGaps,
  };
}

function makeVehicleHistogram(summaries: RunSummary[]) {
  const counts = summaries.map((item) => item.vehicleCount);
  if (!counts.length) return [];
  const minimum = Math.min(...counts);
  const maximum = Math.max(...counts);
  const targetBins = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(counts.length))));
  const width = Math.max(1, Math.ceil((maximum - minimum + 1) / targetBins));
  const binCount = Math.floor((maximum - minimum) / width) + 1;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: minimum + index * width,
    to: Math.min(maximum, minimum + (index + 1) * width - 1),
    count: 0,
  }));

  counts.forEach((count) => {
    const index = Math.min(bins.length - 1, Math.floor((count - minimum) / width));
    bins[index].count += 1;
  });
  return bins;
}

export default function Home() {
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [numberOfRuns, setNumberOfRuns] = useState(DEFAULT_RUNS);
  const [criticalGap, setCriticalGap] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [gapError, setGapError] = useState("");
  const [resultInputs, setResultInputs] = useState<ResultInputs>({
    volume: DEFAULT_VOLUME,
    duration: DEFAULT_DURATION,
    runs: DEFAULT_RUNS,
    criticalGap: null,
    followUpTime: null,
  });
  const [batch, setBatch] = useState<BatchResult>(() => simulateBatch(DEFAULT_VOLUME, DEFAULT_DURATION, DEFAULT_RUNS, seededRandom(2026)));
  const [batchNumber, setBatchNumber] = useState(1);

  const vehicles = batch.lastVehicles;

  const stats = useMemo(() => {
    const counts = batch.summaries.map((item) => item.vehicleCount);
    const totalVehicles = counts.reduce((sum, count) => sum + count, 0);
    const averageVehicles = counts.length ? totalVehicles / counts.length : 0;
    const pooledHeadway = totalVehicles
      ? batch.summaries.reduce((sum, item) => sum + item.meanHeadway * item.vehicleCount, 0) / totalVehicles
      : 0;
    const variance = counts.length > 1
      ? counts.reduce((sum, count) => sum + (count - averageVehicles) ** 2, 0) / (counts.length - 1)
      : 0;
    const standardDeviation = Math.sqrt(variance);
    const confidenceMargin = counts.length > 1 ? 1.96 * standardDeviation / Math.sqrt(counts.length) : 0;
    const expected = resultInputs.volume * resultInputs.duration;
    return {
      averageVehicles,
      pooledHeadway,
      standardDeviation,
      confidenceMargin,
      minimum: counts.length ? Math.min(...counts) : 0,
      maximum: counts.length ? Math.max(...counts) : 0,
      difference: averageVehicles - expected,
    };
  }, [batch, resultInputs]);

  const chart = useMemo(() => {
    const maximumPercent = Math.max(
      1,
      ...batch.headwayBins.flatMap((bin) => [bin.observedPercent, bin.theoreticalPercent]),
    );
    const yMaximum = Math.ceil((maximumPercent * 1.12) / 5) * 5;
    const left = 62;
    const top = 22;
    const plotWidth = 714;
    const plotHeight = 228;
    const baseline = top + plotHeight;
    const slot = plotWidth / batch.headwayBins.length;
    const y = (percent: number) => baseline - (percent / yMaximum) * plotHeight;
    const theoreticalPoints = batch.headwayBins
      .map((bin, index) => `${left + index * slot + slot / 2},${y(bin.theoreticalPercent)}`)
      .join(" ");
    const gridValues = Array.from({ length: 5 }, (_, index) => (yMaximum / 4) * index);
    return { left, plotWidth, baseline, slot, y, theoreticalPoints, gridValues };
  }, [batch.headwayBins]);
  const vehicleHistogram = useMemo(() => makeVehicleHistogram(batch.summaries), [batch.summaries]);
  const maximumVehicleFrequency = Math.max(1, ...vehicleHistogram.map((bin) => bin.count));
  const gapStats = useMemo(() => {
    if (resultInputs.criticalGap === null || resultInputs.followUpTime === null) return null;
    const theoreticalCapacity = hardersCapacity(
      resultInputs.volume,
      resultInputs.criticalGap,
      resultInputs.followUpTime,
    );
    const modeledHours = resultInputs.duration * resultInputs.runs;
    const simulatedCapacity = modeledHours ? batch.totalMinorVehicles / modeledHours : 0;
    return {
      theoreticalCapacity,
      simulatedCapacity,
      averageMinorVehicles: batch.totalMinorVehicles / resultInputs.runs,
      usableGapPercent: batch.totalHeadways
        ? (batch.totalUsableGaps / batch.totalHeadways) * 100
        : 0,
      relativeDifference: theoreticalCapacity
        ? ((simulatedCapacity - theoreticalCapacity) / theoreticalCapacity) * 100
        : 0,
    };
  }, [batch, resultInputs]);

  const runSimulation = () => {
    const safeVolume = Math.min(5000, Math.max(1, Number(volume) || 1));
    const safeDuration = Math.min(24, Math.max(0.1, Number(duration) || 0.1));
    const safeRuns = Math.min(200, Math.max(1, Math.round(Number(numberOfRuns) || 1)));
    const hasCriticalGap = criticalGap.trim() !== "";
    const hasFollowUpTime = followUpTime.trim() !== "";
    if (hasCriticalGap !== hasFollowUpTime) {
      setGapError("Enter both t_c and t_f, or leave both blank to run arrivals only.");
      return;
    }

    let gapAcceptance: GapAcceptanceParameters | null = null;
    if (hasCriticalGap && hasFollowUpTime) {
      const parsedCriticalGap = Number(criticalGap);
      const parsedFollowUpTime = Number(followUpTime);
      if (
        !Number.isFinite(parsedCriticalGap) ||
        !Number.isFinite(parsedFollowUpTime) ||
        parsedCriticalGap <= 0 ||
        parsedFollowUpTime <= 0 ||
        parsedCriticalGap > 120 ||
        parsedFollowUpTime > 120
      ) {
        setGapError("Critical gap and follow-up time must each be between 0.1 and 120 seconds.");
        return;
      }
      gapAcceptance = {
        criticalGap: parsedCriticalGap,
        followUpTime: parsedFollowUpTime,
      };
    }

    setGapError("");
    setVolume(safeVolume);
    setDuration(safeDuration);
    setNumberOfRuns(safeRuns);
    setResultInputs({
      volume: safeVolume,
      duration: safeDuration,
      runs: safeRuns,
      criticalGap: gapAcceptance?.criticalGap ?? null,
      followUpTime: gapAcceptance?.followUpTime ?? null,
    });
    setBatch(simulateBatch(safeVolume, safeDuration, safeRuns, Math.random, gapAcceptance));
    setBatchNumber((current) => current + 1);
  };

  const downloadCsv = () => {
    const includesGapAcceptance = gapStats !== null;
    const rows = [
      includesGapAcceptance
        ? "batch,simulation_run,conflicting_vehicle_id,headway_seconds,minor_vehicles_accepted,gap_start_seconds,gap_end_seconds,gap_end_time,critical_gap_seconds,follow_up_time_seconds,usable_gap"
        : "vehicle_id,headway_seconds,arrival_seconds,arrival_time",
      ...vehicles.map((item) => includesGapAcceptance
        ? [
          batchNumber,
          resultInputs.runs,
          item.id,
          item.headway.toFixed(3),
          item.minorVehicles,
          (item.arrival - item.headway).toFixed(3),
          item.arrival.toFixed(3),
          formatClock(item.arrival),
          resultInputs.criticalGap!.toFixed(3),
          resultInputs.followUpTime!.toFixed(3),
          item.minorVehicles > 0 ? "yes" : "no",
        ].join(",")
        : `${item.id},${item.headway.toFixed(3)},${item.arrival.toFixed(3)},${formatClock(item.arrival)}`),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = includesGapAcceptance
      ? `traffic-gap-capacity-batch-${batchNumber}-run-${resultInputs.runs}.csv`
      : `traffic-arrivals-batch-${batchNumber}-last-run.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadBatchCsv = () => {
    const includesGapAcceptance = gapStats !== null;
    const rows = [
      includesGapAcceptance
        ? "run,conflicting_vehicle_count,mean_headway_seconds,usable_gap_count,minor_vehicles_accepted"
        : "run,vehicle_count,mean_headway_seconds",
      ...batch.summaries.map((item) => includesGapAcceptance
        ? `${item.run},${item.vehicleCount},${item.meanHeadway.toFixed(3)},${item.usableGapCount},${item.minorVehicleCount}`
        : `${item.run},${item.vehicleCount},${item.meanHeadway.toFixed(3)}`),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `traffic-arrivals-batch-${batchNumber}-summary.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadHeadwayCsv = () => {
    const rows = [
      "headway_from_seconds,headway_to_seconds,observed_count,observed_percent,theoretical_percent",
      ...batch.headwayBins.map((bin) => [
        bin.from.toFixed(3),
        bin.to === null ? "infinity" : bin.to.toFixed(3),
        bin.count,
        bin.observedPercent.toFixed(4),
        bin.theoreticalPercent.toFixed(4),
      ].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `traffic-arrivals-batch-${batchNumber}-headway-distribution.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const visibleVehicles = vehicles.slice(0, 8);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Traffic Engineering Lab at UNR home">
          <span className="brandMark" aria-hidden="true"><i /><i /><i /></span>
          <span>TRAFFIC ENGINEERING LAB <small>/ UNR</small></span>
        </a>
        <div className="headerMeta">
          <span className="statusDot" /> STOCHASTIC ARRIVAL MODEL
          <span className="headerRule" />
          <span>BATCH {String(batchNumber).padStart(2, "0")}</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">UNR / TRAFFIC FLOW ANALYSIS / POISSON PROCESS</div>
        <h1>Vehicle arrival<br /><em>simulator.</em></h1>
        <p className="heroCopy">Generate randomized vehicle headways from a traffic volume and observe arrivals until the simulation horizon is reached.</p>
      </section>

      <section className="workspace" aria-label="Simulation workspace">
        <aside className="controlPanel">
          <div className="sectionHeading"><span>01</span><h2>Model inputs</h2></div>

          <label className="field">
            <span className="fieldLabel">Traffic volume</span>
            <span className="inputWrap">
              <input type="number" min="1" max="5000" step="50" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
              <b>vph</b>
            </span>
            <span className="fieldNote">1–5,000 vehicles per hour</span>
          </label>

          <label className="field">
            <span className="fieldLabel">Simulation duration</span>
            <span className="inputWrap">
              <input type="number" min="0.1" max="24" step="0.5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
              <b>hr</b>
            </span>
            <span className="fieldNote">0.1–24 hours</span>
          </label>

          <label className="field compactField">
            <span className="fieldLabel">Number of simulation runs</span>
            <span className="inputWrap">
              <input type="number" min="1" max="200" step="1" value={numberOfRuns} onChange={(event) => setNumberOfRuns(Number(event.target.value))} />
              <b>runs</b>
            </span>
            <span className="fieldNote">1–200 independent repetitions</span>
          </label>

          <fieldset className="optionalModule">
            <legend>Optional gap-acceptance analysis</legend>
            <p>The entered traffic volume is also used as the conflicting flow, v<sub>c</sub>.</p>
            <label className="field compactField">
              <span className="fieldLabel">Critical gap, t<sub>c</sub></span>
              <span className="inputWrap">
                <input
                  type="number"
                  min="0.1"
                  max="120"
                  step="0.1"
                  placeholder="Optional"
                  value={criticalGap}
                  onChange={(event) => setCriticalGap(event.target.value)}
                />
                <b>sec</b>
              </span>
              <span className="fieldNote">Minimum gap needed by the first minor-stream vehicle</span>
            </label>
            <label className="field compactField">
              <span className="fieldLabel">Follow-up time, t<sub>f</sub></span>
              <span className="inputWrap">
                <input
                  type="number"
                  min="0.1"
                  max="120"
                  step="0.1"
                  placeholder="Optional"
                  value={followUpTime}
                  onChange={(event) => setFollowUpTime(event.target.value)}
                />
                <b>sec</b>
              </span>
              <span className="fieldNote">Additional time required by each following vehicle</span>
            </label>
            {gapError && <p className="inputError" role="alert">{gapError}</p>}
          </fieldset>

          <button className="runButton" type="button" onClick={runSimulation}>Run simulation batch <span aria-hidden="true">→</span></button>

          <div className="methodNote">
            <span>METHOD</span>
            <p>Headways follow an exponential distribution:</p>
            <code>h = −ln(U) × 3600 / v</code>
          </div>
        </aside>

        <div className="resultsPanel" aria-live="polite">
          <div className="resultsTopline">
            <div className="sectionHeading"><span>02</span><h2>Simulation results</h2></div>
            <span className="completeBadge"><i /> {resultInputs.runs} RUNS COMPLETE</span>
          </div>

          <div className="metricGrid">
            <article className="metric primaryMetric">
              <span>Total modeled time</span>
              <strong>{(resultInputs.duration * resultInputs.runs).toFixed(1)}<small> hr</small></strong>
              <p>{resultInputs.duration.toFixed(1)} hr horizon × {resultInputs.runs} runs</p>
            </article>
            <article className="metric">
              <span>Average vehicles / run</span>
              <strong>{stats.averageVehicles.toFixed(1)}</strong>
              <p>{stats.difference >= 0 ? "+" : ""}{stats.difference.toFixed(1)} vs. expected</p>
            </article>
            <article className="metric">
              <span>Overall mean headway</span>
              <strong>{stats.pooledHeadway.toFixed(2)}<small> s</small></strong>
              <p>{(3600 / resultInputs.volume).toFixed(2)} s theoretical</p>
            </article>
          </div>

          <div className="ensembleGrid" aria-label="Statistics across all simulation runs">
            <article><span>Runs completed</span><strong>{resultInputs.runs}</strong></article>
            <article><span>Vehicle count range</span><strong>{stats.minimum}–{stats.maximum}</strong></article>
            <article><span>Standard deviation</span><strong>{stats.standardDeviation.toFixed(2)}</strong></article>
            <article><span>95% CI for mean</span><strong>{(stats.averageVehicles - stats.confidenceMargin).toFixed(1)}–{(stats.averageVehicles + stats.confidenceMargin).toFixed(1)}</strong></article>
          </div>

          {gapStats && (
            <section className="capacityCard" aria-labelledby="capacity-heading">
              <div className="capacityHeader">
                <div>
                  <span>03</span>
                  <h2 id="capacity-heading">Harders’ gap-acceptance capacity</h2>
                </div>
                <p>v<sub>c</sub> = {resultInputs.volume.toLocaleString()} vph · t<sub>c</sub> = {resultInputs.criticalGap!.toFixed(1)} s · t<sub>f</sub> = {resultInputs.followUpTime!.toFixed(1)} s</p>
              </div>
              <div className="capacityScope">
                <strong>What the capacity numbers represent</strong>
                <p><b>Harders capacity</b> is one theoretical hourly rate and does not belong to a single run. <b>Simulated rate</b> and <b>usable gaps</b> pool all {resultInputs.runs} runs. <b>Average accepted/run</b> is the mean for one run, calculated from all {resultInputs.runs} runs.</p>
              </div>
              <div className="capacityMetrics">
                <article className="capacityPrimary">
                  <span>Theory · independent of run count</span>
                  <strong>{gapStats.theoreticalCapacity.toFixed(1)}<small> veh/h</small></strong>
                  <p>Harders theoretical minor-stream capacity</p>
                </article>
                <article>
                  <span>All {resultInputs.runs} runs · pooled rate</span>
                  <strong>{gapStats.simulatedCapacity.toFixed(1)}<small> veh/h</small></strong>
                  <p>Simulated service rate · {gapStats.relativeDifference >= 0 ? "+" : ""}{gapStats.relativeDifference.toFixed(1)}% vs. theory</p>
                </article>
                <article>
                  <span>One-run mean · across {resultInputs.runs} runs</span>
                  <strong>{gapStats.averageMinorVehicles.toFixed(1)}<small> veh</small></strong>
                  <p>Average accepted/run · {batch.totalMinorVehicles.toLocaleString()} total</p>
                </article>
                <article>
                  <span>All {resultInputs.runs} runs · pooled gaps</span>
                  <strong>{gapStats.usableGapPercent.toFixed(1)}<small>%</small></strong>
                  <p>Usable gaps · {batch.totalUsableGaps.toLocaleString()} gaps ≥ t<sub>c</sub></p>
                </article>
              </div>
              <div className="capacityMethod">
                <div>
                  <span>HARDERS’ MODEL</span>
                  <code>c = v<sub>c</sub> · e<sup>−v<sub>c</sub>t<sub>c</sub>/3600</sup> / (1 − e<sup>−v<sub>c</sub>t<sub>f</sub>/3600</sup>)</code>
                </div>
                <div>
                  <span>VEHICLES SERVED IN EACH GENERATED GAP h</span>
                  <code>n(h) = 0 if h &lt; t<sub>c</sub>; otherwise 1 + floor((h − t<sub>c</sub>) / t<sub>f</sub>)</code>
                </div>
              </div>
              <p className="capacityNote">Capacity assumes exponential conflicting-stream headways, consistent with the Poisson arrival model above, and continuous minor-stream demand.</p>
            </section>
          )}

          <div className="distributionCard">
            <div className="distributionHeader">
              <div>
                <span>HEADWAY DISTRIBUTION — ALL RUNS</span>
                <p>{batch.totalHeadways.toLocaleString()} accepted headways pooled from {resultInputs.runs} runs</p>
              </div>
              <div className="distributionActions">
                <button type="button" onClick={downloadHeadwayCsv}>Chart data ↓</button>
              </div>
            </div>
            <div className="headwayLegend" aria-hidden="true">
              <span><i className="observedSwatch" />Observed simulation</span>
              <span><i className="theorySwatch" />Theoretical exponential</span>
            </div>
            <div className="headwayChartWrap">
              <svg className="headwayChart" viewBox="0 0 800 315" role="img" aria-labelledby="headway-chart-title headway-chart-description">
                <title id="headway-chart-title">Observed and theoretical headway distribution</title>
                <desc id="headway-chart-description">Orange bars show the percentage of simulated headways in each interval. The green line shows the exponential distribution predicted by the model.</desc>

                {chart.gridValues.map((value) => {
                  const gridY = chart.y(value);
                  return (
                    <g key={value}>
                      <line className="chartGrid" x1={chart.left} y1={gridY} x2={chart.left + chart.plotWidth} y2={gridY} />
                      <text className="chartTick" x={chart.left - 12} y={gridY + 3} textAnchor="end">{value.toFixed(0)}%</text>
                    </g>
                  );
                })}

                {batch.headwayBins.map((bin, index) => {
                  const x = chart.left + index * chart.slot + 5;
                  const barY = chart.y(bin.observedPercent);
                  const label = bin.to === null ? `>${bin.from.toFixed(1)}` : `${bin.from.toFixed(1)}–${bin.to.toFixed(1)}`;
                  return (
                    <g key={`${bin.from}-${bin.to ?? "plus"}`}>
                      <rect className="headwayBar" x={x} y={barY} width={Math.max(4, chart.slot - 10)} height={chart.baseline - barY}>
                        <title>{label} seconds: {bin.observedPercent.toFixed(2)}% observed ({bin.count.toLocaleString()} headways)</title>
                      </rect>
                      <text className="chartTick xTick" x={x + (chart.slot - 10) / 2} y={chart.baseline + 19} textAnchor="middle">{label}</text>
                    </g>
                  );
                })}

                <polyline className="theoryLine" points={chart.theoreticalPoints} />
                {batch.headwayBins.map((bin, index) => (
                  <circle
                    className="theoryPoint"
                    key={`theory-${index}`}
                    cx={chart.left + index * chart.slot + chart.slot / 2}
                    cy={chart.y(bin.theoreticalPercent)}
                    r="3.5"
                  >
                    <title>{bin.theoreticalPercent.toFixed(2)}% theoretical probability</title>
                  </circle>
                ))}
                <line className="chartAxis" x1={chart.left} y1={chart.baseline} x2={chart.left + chart.plotWidth} y2={chart.baseline} />
                <text className="axisTitle" x={chart.left + chart.plotWidth / 2} y="306" textAnchor="middle">HEADWAY INTERVAL (SECONDS)</text>
                <text className="axisTitle" transform="translate(15 136) rotate(-90)" textAnchor="middle">RELATIVE FREQUENCY</text>
              </svg>
            </div>
            <div className="chartCaption"><span>Orange bars: observed accepted headways</span><span>Acid line: expected exponential probabilities</span></div>
          </div>

          <div className="distributionCard secondaryDistribution">
            <div className="distributionHeader">
              <div>
                <span>VEHICLE COUNT DISTRIBUTION — ALL RUNS</span>
                <p>Run-to-run variation in the number of completed arrivals</p>
              </div>
              <div className="distributionActions">
                <button type="button" onClick={downloadBatchCsv}>All-runs summary CSV ↓</button>
              </div>
            </div>
            <div className="vehicleHistogram" role="img" aria-label={`Histogram of vehicle counts from ${resultInputs.runs} simulation runs`}>
              {vehicleHistogram.map((bin) => (
                <div className="vehicleHistColumn" key={`${bin.from}-${bin.to}`}>
                  <span className="vehicleHistFrequency">{bin.count} {bin.count === 1 ? "run" : "runs"}</span>
                  <div className="vehicleHistTrack">
                    <div className="vehicleHistBar" style={{ height: `${Math.max(5, (bin.count / maximumVehicleFrequency) * 100)}%` }}>
                      <span>{bin.count}</span>
                    </div>
                  </div>
                  <span className="vehicleHistLabel">{bin.from === bin.to ? bin.from : `${bin.from}–${bin.to}`}</span>
                </div>
              ))}
            </div>
            <div className="chartCaption"><span>Vehicle count per simulation run →</span><span>Bar height: number of runs</span></div>
          </div>

          <div className="roadCard" aria-label="Arrival timeline visualization">
            <div className="roadHeader"><span>LAST RUN ARRIVAL TIMELINE</span><span>FIRST {Math.min(8, vehicles.length)} VEHICLES</span></div>
            <div className="road">
              <div className="roadLine" />
              {visibleVehicles.map((vehicle, index) => (
                <div className="vehicleMarker" key={vehicle.id} style={{ left: `${5 + (index / Math.max(visibleVehicles.length - 1, 1)) * 90}%` }} title={`Vehicle ${vehicle.id}: ${formatClock(vehicle.arrival)}`}>
                  <span>{String(vehicle.id).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
            <div className="roadScale"><span>00:00:00</span><span>{visibleVehicles.length ? formatClock(visibleVehicles.at(-1)!.arrival) : "—"}</span></div>
          </div>

          <div className="tableBlock">
            <div className="tableHeader">
              <div>
                <span>{gapStats ? "LAST RUN HEADWAY & CAPACITY LOG" : "LAST RUN ARRIVAL LOG"}</span>
                <p>Run {resultInputs.runs} of {resultInputs.runs} · first five shown · CSV includes every headway in this run</p>
              </div>
              <button type="button" onClick={downloadCsv} disabled={!vehicles.length}>{gapStats ? "Last-run gaps CSV ↓" : "Export CSV ↓"}</button>
            </div>
            <div className="tableScroll">
              <table>
                <thead><tr><th>Vehicle</th><th>Headway (s)</th>{gapStats && <th>Minor veh. accepted in this headway</th>}<th>Arrival (s)</th><th>Clock time</th></tr></thead>
                <tbody>
                  {vehicles.slice(0, 5).map((vehicle) => (
                    <tr key={vehicle.id}><td>#{String(vehicle.id).padStart(3, "0")}</td><td>{vehicle.headway.toFixed(3)}</td>{gapStats && <td>{vehicle.minorVehicles}</td>}<td>{vehicle.arrival.toFixed(3)}</td><td>{formatClock(vehicle.arrival)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <footer><span>TRAFFIC ENGINEERING LAB / UNR</span><span>Independent exponential headways • Poisson arrivals</span></footer>
    </main>
  );
}
