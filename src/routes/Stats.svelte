<script>
    import { session } from "../lib/stores/session.svelte";
    import { settings } from "../lib/stores/settings.svelte";
    import { onMount, tick } from "svelte";
    import {
        Chart as ChartJS,
        Title,
        Tooltip,
        Legend,
        BarElement,
        BarController,
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        LineController,
        Filler,
    } from "chart.js";

    ChartJS.register(
        Title,
        Tooltip,
        Legend,
        BarElement,
        BarController,
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        LineController,
        Filler,
    );

    let sessions = $state([]);
    let isLoading = $state(false);

    // Stats
    let totalHours = $state(0);
    let peakHour = $state("N/A");
    let peakValue = $state(0);
    let consistencyScore = $state(0);
    let hourlyDistribution = $state(new Array(24).fill(0));

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                titleColor: "#1d1b20",
                bodyColor: "#1d1b20",
                borderColor: "rgba(103, 80, 164, 0.1)",
                borderWidth: 1,
                padding: 12,
                boxPadding: 4,
                callbacks: {
                    label: (context) => {
                        const h = context.parsed.x;
                        const label =
                            h >= 12
                                ? h === 12
                                    ? "12 PM"
                                    : `${h - 12} PM`
                                : h === 0
                                  ? "12 AM"
                                  : `${h} AM`;
                        return `${label}: ${context.parsed.y.toFixed(1)}h total activity`;
                    },
                },
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: "rgba(0,0,0,0.03)" },
                ticks: {
                    font: { size: 10 },
                    color: "#938F99",
                    callback: (v) => `${v}h`,
                },
            },
            x: {
                grid: { display: false },
                ticks: {
                    font: { size: 10 },
                    color: "#938F99",
                    callback: function (v) {
                        return v % 4 === 0
                            ? v >= 12
                                ? v === 12
                                    ? "12pm"
                                    : `${v - 12}pm`
                                : v === 0
                                  ? "12am"
                                  : `${v}am`
                            : "";
                    },
                },
            },
        },
    };

    let canvas = $state();
    let chartInstance;

    onMount(() => {
        loadData();
    });

    async function loadData() {
        isLoading = true;

        // Fetch strictly from local database
        const rawSessions = await session.getRecentSessions();
        const normalizedSessions = rawSessions.map((s) => ({
            start: new Date(s.start_time),
            duration: s.duration_minutes || 0,
        }));

        sessions = normalizedSessions;

        if (sessions.length === 0) {
            isLoading = false;
            if (chartInstance) chartInstance.destroy();
            return;
        }

        const distribution = new Array(24).fill(0);
        let activeDays = new Set();
        let totalMins = 0;

        sessions.forEach((s) => {
            if (!s.start || isNaN(s.start.getTime())) return;
            activeDays.add(s.start.toISOString().split("T")[0]);

            const startHour = s.start.getHours();
            const duration = s.duration;
            totalMins += duration;
            distribution[startHour] += duration / 60;
        });

        hourlyDistribution = distribution;
        totalHours = parseFloat((totalMins / 60).toFixed(1));

        // Find peak hour
        let maxVal = 0;
        let maxIdx = -1;
        distribution.forEach((val, idx) => {
            if (val > maxVal) {
                maxVal = val;
                maxIdx = idx;
            }
        });

        if (maxIdx !== -1) {
            peakHour =
                maxIdx >= 12
                    ? maxIdx === 12
                        ? "12 PM"
                        : `${maxIdx - 12} PM`
                    : maxIdx === 0
                      ? "12 AM"
                      : `${maxIdx} AM`;
            peakValue = maxVal;
        } else {
            peakHour = "N/A";
        }

        consistencyScore = Math.min(
            100,
            Math.round((activeDays.size / 30) * 100),
        );

        isLoading = false;
        await tick();

        if (chartInstance) chartInstance.destroy();
        if (canvas) {
            chartInstance = new ChartJS(canvas, {
                type: "line",
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => i),
                    datasets: [
                        {
                            data: distribution.map((v) =>
                                parseFloat(v.toFixed(1)),
                            ),
                            backgroundColor: "rgba(103, 80, 164, 0.15)",
                            borderColor: "#6750A4",
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHoverRadius: 6,
                            pointHoverBackgroundColor: "#6750A4",
                            pointHoverBorderColor: "#fff",
                            pointHoverBorderWidth: 2,
                        },
                    ],
                },
                options: chartOptions,
            });
        }
    }
</script>

<div class="h-full flex flex-col gap-6 animate-in fade-in duration-700">
    <div class="flex items-center justify-between">
        <h2 class="text-2xl font-normal text-gray-800">Insights Dashboard</h2>
        <div class="px-4 py-2 bg-primary/5 rounded-xl border border-primary/10">
            <span
                class="text-[10px] font-bold text-primary uppercase tracking-tighter"
                >Live Tracker Overview</span
            >
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- Peak Productivity Card -->
        <div
            class="bg-primary/5 p-5 rounded-[24px] shadow-sm ring-1 ring-primary/20 flex flex-col relative overflow-hidden"
        >
            <span
                class="text-xs font-bold text-primary uppercase tracking-wider mb-1 z-10"
                >Peak Rhythm</span
            >
            <div class="flex items-end gap-2 mt-auto z-10">
                <span class="text-3xl font-normal text-primary">{peakHour}</span
                >
            </div>
            <p class="text-[10px] text-primary/60 mt-1 z-10">
                Most active hourly window
            </p>
            <span
                class="material-symbols-outlined absolute -right-2 -bottom-2 text-7xl text-primary/5 pointer-events-none"
                >schedule</span
            >
        </div>

        <!-- Consistency Score -->
        <div
            class="bg-white p-5 rounded-[24px] shadow-sm ring-1 ring-black/5 flex flex-col md:col-span-2"
        >
            <div class="flex justify-between items-start mb-2">
                <span
                    class="text-xs font-bold text-gray-400 uppercase tracking-wider"
                    >Work Consistency</span
                >
                <span class="text-xs font-bold text-primary"
                    >{consistencyScore}%</span
                >
            </div>
            <div class="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                    class="h-full bg-primary transition-all duration-1000"
                    style="width: {consistencyScore}%"
                ></div>
            </div>
            <div
                class="flex justify-between items-center text-[11px] text-gray-500"
            >
                <span>Momentum Score (30d)</span>
                <span
                    class="font-bold {consistencyScore > 70
                        ? 'text-primary'
                        : ''}"
                >
                    {consistencyScore > 70 ? "High Focus 🔥" : "Building Habit"}
                </span>
            </div>
        </div>

        <!-- Total Volume Card -->
        <div
            class="bg-white p-5 rounded-[24px] shadow-sm ring-1 ring-black/5 flex flex-col"
        >
            <span
                class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
                >History Volume</span
            >
            <div class="flex items-end gap-2 mt-auto">
                <span class="text-3xl font-normal text-gray-800"
                    >{totalHours}</span
                >
                <span class="text-sm text-gray-500 mb-1">hrs</span>
            </div>
        </div>
    </div>

    <!-- 24-Hour Rhythm Chart -->
    <div
        class="flex-1 bg-white p-6 rounded-[28px] shadow-sm ring-1 ring-black/5 min-h-[350px] flex flex-col"
    >
        <div class="flex items-center justify-between mb-8">
            <div>
                <h2 class="text-2xl font-normal text-gray-800">
                    24h Work Rhythm
                </h2>
                <p class="text-sm text-gray-500">
                    Distribution of productivity intensity
                </p>
            </div>
            <div
                class="px-4 py-1.5 bg-gray-50 text-gray-500 text-[10px] font-bold rounded-full border border-gray-100 uppercase tracking-widest"
            >
                Tracker Database
            </div>
        </div>

        <div class="flex-1 relative">
            {#if isLoading}
                <div
                    class="absolute inset-0 flex items-center justify-center text-gray-400 flex-col gap-3 bg-white/50 backdrop-blur-[2px] z-20"
                >
                    <span
                        class="material-symbols-outlined animate-spin text-3xl text-primary"
                        >refresh</span
                    >
                    <span
                        class="text-xs font-bold text-primary uppercase tracking-widest animate-pulse"
                    >
                        Calculating Insights...
                    </span>
                </div>
            {/if}

            {#if !isLoading && sessions.length === 0}
                <div
                    class="absolute inset-0 flex items-center justify-center text-gray-400 flex-col gap-3"
                >
                    <div
                        class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center"
                    >
                        <span
                            class="material-symbols-outlined text-3xl opacity-20"
                            >insights</span
                        >
                    </div>
                    <div class="text-center">
                        <p class="text-sm font-medium text-gray-600">
                            No data found
                        </p>
                        <p class="text-[11px] max-w-[220px] mx-auto mt-1">
                            Start tracking sessions to see your local work
                            rhythm.
                        </p>
                    </div>
                </div>
            {:else}
                <div class="w-full h-full pb-4">
                    <canvas bind:this={canvas}></canvas>
                </div>
            {/if}
        </div>

        <div
            class="mt-4 pt-6 border-t border-gray-50 grid grid-cols-3 gap-4 text-center"
        >
            <div>
                <div
                    class="text-[10px] uppercase font-bold text-gray-300 tracking-widest mb-1"
                >
                    Night
                </div>
                <div class="text-xs font-medium text-gray-500">
                    00:00 - 08:00
                </div>
            </div>
            <div class="border-x border-gray-50">
                <div
                    class="text-[10px] uppercase font-bold text-gray-300 tracking-widest mb-1"
                >
                    Day
                </div>
                <div class="text-xs font-medium text-gray-500">
                    08:00 - 16:00
                </div>
            </div>
            <div>
                <div
                    class="text-[10px] uppercase font-bold text-gray-300 tracking-widest mb-1"
                >
                    Evening
                </div>
                <div class="text-xs font-medium text-gray-500">
                    16:00 - 00:00
                </div>
            </div>
        </div>
    </div>
</div>
