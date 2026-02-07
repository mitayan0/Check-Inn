<script>
    import { session } from "../lib/stores/session.svelte";
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
    } from "chart.js";

    ChartJS.register(
        Title,
        Tooltip,
        Legend,
        BarElement,
        BarController,
        CategoryScale,
        LinearScale,
    );

    let sessions = $state([]);
    let isLoading = $state(true);

    // Stats
    let totalHours = $state(0);
    let avgDuration = $state(0); // in minutes
    let avgStartTime = $state("N/A");

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.raw} hours`,
                },
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: "Hours Worked",
                },
            },
        },
    };

    let canvas = $state();
    let chartInstance;

    async function loadData() {
        isLoading = true;
        const rawSessions = await session.getRecentSessions();
        sessions = rawSessions.reverse(); // Chronological order for chart

        if (sessions.length === 0) {
            isLoading = false;
            return;
        }

        // Process for Chart (Group by Date)
        const dailyMap = new Map();
        let totalMinutes = 0;
        let startMinutesSum = 0;
        let startCount = 0;

        sessions.forEach((s) => {
            const date = new Date(s.start_time).toLocaleDateString();
            const duration = s.end_time
                ? (new Date(s.end_time) - new Date(s.start_time)) /
                  (1000 * 60 * 60)
                : 0; // Hours

            dailyMap.set(date, (dailyMap.get(date) || 0) + duration);

            // Stats calculation
            if (s.duration_minutes) {
                totalMinutes += s.duration_minutes;
            }

            // Avg Start Time
            const startDate = new Date(s.start_time);
            const dayStart = new Date(startDate);
            dayStart.setHours(0, 0, 0, 0);
            const minutesFromMidnight = (startDate - dayStart) / (1000 * 60);
            startMinutesSum += minutesFromMidnight;
            startCount++;
        });

        // Summary Stats Update
        totalHours = parseFloat((totalMinutes / 60).toFixed(1));
        avgDuration =
            sessions.length > 0
                ? Math.round(totalMinutes / sessions.length)
                : 0;

        if (startCount > 0) {
            const avgStartMin = startMinutesSum / startCount;
            const h = Math.floor(avgStartMin / 60);
            const m = Math.floor(avgStartMin % 60);
            const ampm = h >= 12 ? "PM" : "AM";
            avgStartTime = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
        }

        isLoading = false;
        await tick(); // Ensure canvas is rendered

        // Destroy previous instance
        if (chartInstance) chartInstance.destroy();

        if (canvas) {
            chartInstance = new ChartJS(canvas, {
                type: "bar",
                data: {
                    labels: Array.from(dailyMap.keys()),
                    datasets: [
                        {
                            label: "Hours Worked",
                            data: Array.from(dailyMap.values()).map((v) =>
                                parseFloat(v.toFixed(1)),
                            ),
                            backgroundColor: "#6750A4", // Primary color
                            borderRadius: 8,
                        },
                    ],
                },
                options: chartOptions,
            });
        }
    }

    $effect(() => {
        loadData();
    });
</script>

<div class="h-full flex flex-col gap-6">
    <!-- Key Metrics Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
            class="bg-white p-5 rounded-[24px] shadow-sm ring-1 ring-black/5 flex flex-col"
        >
            <span
                class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
                >Total Hours (Recent)</span
            >
            <div class="flex items-end gap-2 mt-auto">
                <span class="text-3xl font-normal text-gray-800"
                    >{totalHours}</span
                >
                <span class="text-sm text-gray-500 mb-1">hours</span>
            </div>
        </div>

        <div
            class="bg-white p-5 rounded-[24px] shadow-sm ring-1 ring-black/5 flex flex-col"
        >
            <span
                class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
                >Avg. Session Length</span
            >
            <div class="flex items-end gap-2 mt-auto">
                <span class="text-3xl font-normal text-gray-800"
                    >{(avgDuration / 60).toFixed(1)}</span
                >
                <span class="text-sm text-gray-500 mb-1">hours</span>
            </div>
        </div>

        <div
            class="bg-white p-5 rounded-[24px] shadow-sm ring-1 ring-black/5 flex flex-col"
        >
            <span
                class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1"
                >Avg. Start Time</span
            >
            <div class="flex items-end gap-2 mt-auto">
                <span class="text-3xl font-normal text-gray-800"
                    >{avgStartTime}</span
                >
                <span class="text-sm text-gray-500 mb-1">daily</span>
            </div>
        </div>
    </div>

    <!-- Chart Section -->
    <div
        class="flex-1 bg-white p-6 rounded-[24px] shadow-sm ring-1 ring-black/5 min-h-[300px] flex flex-col"
    >
        <div class="flex items-center justify-between mb-6">
            <div>
                <h2 class="text-xl font-normal text-gray-800">Work Trends</h2>
                <p class="text-sm text-gray-500">
                    Daily hours worked over recent sessions
                </p>
            </div>
            <button
                onclick={loadData}
                class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                title="Refresh Data"
            >
                <span class="material-symbols-outlined text-gray-500"
                    >refresh</span
                >
            </button>
        </div>

        <div class="flex-1 relative w-full h-full min-h-[250px]">
            {#if isLoading}
                <div
                    class="absolute inset-0 flex items-center justify-center text-gray-400"
                >
                    <span
                        class="material-symbols-outlined animate-spin text-3xl"
                        >refresh</span
                    >
                </div>
            {:else if sessions.length === 0}
                <div
                    class="absolute inset-0 flex items-center justify-center text-gray-400 flex-col gap-2"
                >
                    <span class="material-symbols-outlined text-4xl opacity-50"
                        >bar_chart</span
                    >
                    <span class="text-sm">No data available yet</span>
                </div>
            {:else}
                <div class="w-full h-full">
                    <canvas bind:this={canvas}></canvas>
                </div>
            {/if}
        </div>
    </div>
</div>
