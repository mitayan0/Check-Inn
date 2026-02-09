<script lang="ts">
  import { sidecar } from "../lib/services/sidecar.svelte";

  import { onMount } from "svelte";

  // Set default date range to last 30 days if not set
  onMount(() => {
    if (!sidecar.analysisParams.fromDate) {
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      sidecar.analysisParams.toDate = today.toISOString().split("T")[0];
      sidecar.analysisParams.fromDate = thirtyDaysAgo
        .toISOString()
        .split("T")[0];
    }

    // Refresh groups on mount
    if (sidecar.isWhatsAppReady) {
      sidecar.refreshGroups();
    }
  });

  function handleAnalyze() {
    if (
      !sidecar.analysisParams.groupId ||
      !sidecar.analysisParams.fromDate ||
      !sidecar.analysisParams.toDate
    ) {
      return;
    }
    sidecar.analyzeWorkHours(
      sidecar.analysisParams.groupId,
      sidecar.analysisParams.fromDate,
      sidecar.analysisParams.toDate,
    );
  }
</script>

<div class="space-y-6">
  <!-- Connection Status Banner -->
  {#if !sidecar.isWhatsAppReady}
    <div
      class="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-3"
    >
      <span class="material-symbols-outlined text-amber-500">warning</span>
      <div>
        <p class="text-sm font-medium text-amber-700">WhatsApp not connected</p>
        <p class="text-xs text-amber-600">
          Go to Settings to connect WhatsApp first.
        </p>
      </div>
    </div>
  {:else}
    <!-- Controls Section -->
    <div class="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6">
      <h3
        class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4"
      >
        Select Date Range
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- Group Selector -->
        <div class="md:col-span-2">
          <label
            for="groupSelect"
            class="block text-xs font-medium text-gray-500 mb-1"
            >Target Group</label
          >
          <div class="relative">
            <select
              id="groupSelect"
              class="w-full h-11 pl-4 pr-10 rounded-xl border border-gray-300 appearance-none bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
              bind:value={sidecar.analysisParams.groupId}
            >
              <option value="">-- Select a group --</option>
              {#each sidecar.availableGroups as g}
                <option value={g.id}>{g.name}</option>
              {/each}
            </select>
            <span
              class="absolute inset-y-0 right-3 flex items-center text-gray-400 pointer-events-none"
            >
              <span class="material-symbols-outlined text-lg">expand_more</span>
            </span>
          </div>
          {#if sidecar.availableGroups.length === 0}
            <div class="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">warning</span>
              No groups found. Try refreshing.
            </div>
            <button
              class="mt-1 text-xs text-primary hover:underline font-medium"
              onclick={() => sidecar.refreshGroups()}
              disabled={sidecar.isFetchingGroups}
            >
              {sidecar.isFetchingGroups
                ? "Loading groups..."
                : "Refresh groups"}
            </button>
          {/if}
        </div>

        <!-- From Date -->
        <div>
          <label
            for="fromDate"
            class="block text-xs font-medium text-gray-500 mb-1">From</label
          >
          <input
            type="date"
            id="fromDate"
            bind:value={sidecar.analysisParams.fromDate}
            class="w-full h-11 px-4 rounded-xl border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
          />
        </div>

        <!-- To Date -->
        <div>
          <label
            for="toDate"
            class="block text-xs font-medium text-gray-500 mb-1">To</label
          >
          <input
            type="date"
            id="toDate"
            bind:value={sidecar.analysisParams.toDate}
            class="w-full h-11 px-4 rounded-xl border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
          />
        </div>
      </div>

      <!-- Analyze Button -->
      <div class="mt-6 flex gap-3">
        <button
          onclick={handleAnalyze}
          disabled={!sidecar.analysisParams.groupId ||
            !sidecar.analysisParams.fromDate ||
            !sidecar.analysisParams.toDate ||
            sidecar.isAnalyzing}
          class="px-6 py-3 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if sidecar.isAnalyzing}
            <span
              class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
            ></span>
            Analyzing...
          {:else}
            <span class="material-symbols-outlined text-lg">query_stats</span>
            Analyze Work Hours
          {/if}
        </button>
      </div>
    </div>

    <!-- Error Message -->
    {#if sidecar.analysisError}
      <div
        class="p-4 bg-red-50 rounded-xl border border-red-200 flex items-center gap-3"
      >
        <span class="material-symbols-outlined text-red-500">error</span>
        <p class="text-sm text-red-700">{sidecar.analysisError}</p>
      </div>
    {/if}

    <!-- Results Section -->
    {#if sidecar.analysisResult}
      {@const result = sidecar.analysisResult}

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          class="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-5 border border-primary/20"
        >
          <p
            class="text-xs text-primary/70 font-medium uppercase tracking-wider"
          >
            Total Hours
          </p>
          <p class="text-3xl font-bold text-primary mt-1">
            {result.totalFormatted}
          </p>
        </div>
        <div
          class="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-2xl p-5 border border-blue-500/20"
        >
          <p
            class="text-xs text-blue-600/70 font-medium uppercase tracking-wider"
          >
            Work Days
          </p>
          <p class="text-3xl font-bold text-blue-600 mt-1">
            {result.totalDays}
          </p>
        </div>
        <div
          class="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-2xl p-5 border border-green-500/20"
        >
          <p
            class="text-xs text-green-600/70 font-medium uppercase tracking-wider"
          >
            Avg Hours/Day
          </p>
          <p class="text-3xl font-bold text-green-600 mt-1">
            {result.totalDays > 0
              ? Math.round(
                  (result.totalRawMinutes / result.totalDays / 60) * 10,
                ) / 10
              : 0}h
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <button
            onclick={() => {
              const allTasks = result.workDays.flatMap(
                (d: any) => d.todayFocus || [],
              );
              sidecar.summarizeTasks([...new Set(allTasks)] as string[]);
            }}
            disabled={sidecar.isSummarizing}
            class="flex-1 bg-primary text-white rounded-2xl p-5 border border-primary/20 flex flex-col items-center justify-center gap-1 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {#if sidecar.isSummarizing}
              <span
                class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
              ></span>
            {:else}
              <span class="material-symbols-outlined text-3xl"
                >auto_awesome</span
              >
              <span class="text-[10px] font-bold uppercase tracking-tighter"
                >Generate AI Report</span
              >
            {/if}
          </button>
        </div>
      </div>

      <!-- AI Summary Display -->
      {#if sidecar.aiSummary || sidecar.summaryError}
        <div
          class="bg-white rounded-[28px] overflow-hidden shadow-sm ring-1 ring-black/5 animate-in fade-in slide-in-from-top-4 duration-500"
        >
          <div class="p-6">
            <div class="flex items-center gap-3 mb-4">
              <span class="material-symbols-outlined text-primary"
                >auto_awesome</span
              >
              <h3 class="text-lg font-normal text-gray-800">
                AI Achievement Report
              </h3>
            </div>
            {#if sidecar.summaryError}
              <div
                class="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100"
              >
                {sidecar.summaryError}
              </div>
            {:else}
              <div
                class="prose prose-sm max-w-none text-gray-600 text-sm leading-relaxed whitespace-pre-wrap"
              >
                {sidecar.aiSummary}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Results Table -->
      <div
        class="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden"
      >
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-100">
              <tr>
                <th
                  class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >Date</th
                >
                <th
                  class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >Sessions</th
                >
                <th
                  class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >Total Hours</th
                >
                <th
                  class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >Working Details</th
                >
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each result.workDays as day}
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    <div>
                      {new Date(day.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    {#if day.sessionCount > 1}
                      <div class="text-xs text-gray-400 mt-0.5">
                        {day.sessionCount} sessions
                      </div>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">
                    <div class="space-y-1">
                      {#if day.sessionList && day.sessionList.length > 0}
                        {#each day.sessionList as session}
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-medium text-gray-700">
                              {session.checkIn}
                              <span class="text-gray-400 font-normal px-0.5"
                                >to</span
                              >
                              {session.checkOut || "(ongoing)"}
                            </span>
                            {#if session.duration}
                              <span
                                class="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500"
                              >
                                {Math.floor(session.duration / 60)}h {Math.round(
                                  session.duration % 60,
                                )}m
                              </span>
                            {/if}
                            {#if session.isBreak}
                              <span
                                class="text-xs px-1.5 py-0.5 bg-orange-100 rounded text-orange-600 font-medium"
                                >break</span
                              >
                            {:else if session.isFinal}
                              <span
                                class="text-xs px-1.5 py-0.5 bg-green-100 rounded text-green-600 font-medium"
                                >final</span
                              >
                            {/if}
                          </div>
                        {/each}
                      {:else}
                        <span class="text-xs text-red-400 italic"
                          >No sessions data</span
                        >
                      {/if}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm">
                    <span
                      class="px-2 py-1 rounded-lg text-xs font-semibold {day.duration
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'}"
                    >
                      {day.durationFormatted}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600 max-w-xs">
                    <div class="space-y-1">
                      {#if day.todayFocus && day.todayFocus.length > 0}
                        {#each day.todayFocus.slice(0, 3) as task}
                          <div class="flex items-start gap-1.5 min-w-0">
                            <span class="text-xs text-primary/60 mt-1">•</span>
                            <span class="text-xs text-gray-600 truncate"
                              >{task}</span
                            >
                          </div>
                        {/each}
                        {#if day.todayFocus.length > 3}
                          <div class="text-[10px] text-gray-400 pl-3">
                            +{day.todayFocus.length - 3} more
                          </div>
                        {/if}
                      {:else}
                        <span class="text-xs text-gray-400 italic"
                          >No tasks recorded</span
                        >
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="bg-primary/5 border-t-2 border-primary/20">
              <tr>
                <td class="px-4 py-3 text-sm font-bold text-primary">
                  TOTAL
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {result.totalSessions ||
                    result.workDays.reduce(
                      (sum: number, d: any) => sum + (d.sessionCount || 1),
                      0,
                    )} sessions
                </td>
                <td class="px-4 py-3">
                  <span
                    class="px-3 py-1 rounded-lg text-sm font-bold bg-primary text-white"
                  >
                    {result.totalFormatted}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {result.totalDays} work days
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    {:else if !sidecar.isAnalyzing}
      <!-- Empty State -->
      <div
        class="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-12 text-center"
      >
        <span class="material-symbols-outlined text-6xl text-gray-300"
          >analytics</span
        >
        <p class="mt-4 text-lg font-medium text-gray-500">
          No analysis results yet
        </p>
        <p class="text-sm text-gray-400 mt-1">
          Select a group and date range, then click "Analyze Work Hours" to see
          your work time summary.
        </p>
      </div>
    {/if}
  {/if}
</div>
