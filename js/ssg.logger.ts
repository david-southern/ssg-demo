export enum SSGSystemFilter {
    Initialization,
    RenderSettings,
    RenderDiagnostics,
    ExportDiagnostics,
    ModelBuilding,
    TimingDiagnostics,
    Always
}

class LoggerImpl {
    private filteredSystems = new Map<SSGSystemFilter, boolean>();

    constructor() {
        // this.filterSystem(SSGSystemFilter.RenderSettings, false);

        this.filterSystem(SSGSystemFilter.Initialization, false);
        this.filterSystem(SSGSystemFilter.RenderDiagnostics, false);
        this.filterSystem(SSGSystemFilter.ExportDiagnostics, false);
        this.filterSystem(SSGSystemFilter.ModelBuilding, false);
        this.filterSystem(SSGSystemFilter.TimingDiagnostics, false);
    }

    public filterSystem(system: SSGSystemFilter, allow: boolean = false) {
        this.filteredSystems.set(system, !allow);
    }

    public wouldLog(system: SSGSystemFilter): boolean {
        return system == SSGSystemFilter.Always || !this.filteredSystems.get(system);
    }

    public info(system: SSGSystemFilter, message: string, ...args: any[]) {
        if (this.wouldLog(system)) {
            console.log(`${SSGSystemFilter[system]}: ${message}`, ...args);
        }
    }

    public error(system: SSGSystemFilter, message: string, ...args: any[]) {
        console.error(`${SSGSystemFilter[system]}: ${message}`, ...args);
    }
}

export const Logger = new LoggerImpl();