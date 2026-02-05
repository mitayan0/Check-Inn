<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getModules, type Module } from "./lib/modules/registry";
  import { settings } from "./lib/stores/settings.svelte";

  // State for routing
  let activeModuleId = $state("dashboard");
  let modules = $state<Module[]>(getModules());

  // Derived current component
  let CurrentComponent = $derived(
    modules.find((m) => m.id === activeModuleId)?.component ||
      modules[0].component,
  );

  onMount(async () => {
    // Other init logic if needed
  });

  // Watch for settings change if user toggles it manually while running
  $effect(() => {
    if (settings.autoStart) {
      console.log("Auto-start enabled, forcing sidecar start...");
      invoke("start_sidecar").catch((e) =>
        console.error("Effect start error:", e),
      );
    }
  });
</script>

<div class="flex h-screen bg-surface text-[#1D1B20] overflow-hidden font-sans">
  <!-- Navigation Rail -->
  <nav class="w-20 bg-surface flex flex-col items-center py-4 gap-3 z-10">
    <div class="mb-4">
      <!-- Menu / branding icon -->
      <div
        class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold shadow-sm"
      >
        C
      </div>
    </div>

    {#each modules as module (module.id)}
      {@const isActive = activeModuleId === module.id}
      <button
        class="group flex flex-col items-center justify-center w-14 gap-1 p-0 bg-transparent border-0 cursor-pointer"
        onclick={() => (activeModuleId = module.id)}
        aria-label={module.name}
        title={module.name}
      >
        <div
          class="flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ease-in-out
          {isActive
            ? 'bg-primary-container text-on-primary-container'
            : 'text-gray-600 group-hover:bg-primary-container/20'}"
        >
          <span class="material-symbols-outlined text-[24px]"
            >{module.icon}</span
          >
        </div>
        <span
          class="text-[11px] font-medium tracking-wide {isActive
            ? 'text-gray-900 font-bold'
            : 'text-gray-600'}"
        >
          {module.name}
        </span>
      </button>
    {/each}
  </nav>

  <!-- Main Content -->
  <main
    class="flex-1 my-4 mr-4 bg-[#F3EDF7] rounded-[28px] overflow-hidden shadow-sm ring-1 ring-black/5 flex flex-col"
  >
    <!-- Top Bar placeholder (optional, can be part of page) -->

    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-4xl mx-auto">
        <!-- Centered content constraint for readability -->
        <h1 class="text-[32px] leading-10 font-normal mb-8 text-gray-800">
          {modules.find((m) => m.id === activeModuleId)?.name}
        </h1>
        <CurrentComponent />
      </div>
    </div>
  </main>
</div>
