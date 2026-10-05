export interface paths {
    "/v1/machines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            kind: "milling" | "drilling" | "lathe" | "press" | "grinding" | "welding" | "conveyor" | "pump";
                            location: string;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            online: boolean;
                            availability: number | null;
                            alert: 0 | 1 | 2 | 3;
                            lastReadingAt?: number | null;
                            samples?: number;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            online: boolean;
                            availability: number | null;
                            alert: 0 | 1 | 2 | 3;
                            lastReadingAt?: number | null;
                            samples?: number;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/telemetry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            online: boolean;
                            availability: number | null;
                            anomalyScore: number | null;
                            confidence: number | null;
                            activeStates: number;
                            states: {
                                index: number;
                                share: number;
                            }[];
                            currentState: number | null;
                            maintenance: {
                                previous: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                                current: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                                next: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                            };
                            faults: {
                                previous: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                                current: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                                next: {
                                    /** @enum {string} */
                                    category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                                    at: number;
                                    until?: number;
                                    interval?: string;
                                } | null;
                            };
                            maintenanceMode: boolean;
                            monitoringEnabled: boolean;
                            latestReading?: {
                                at: number;
                                metrics: {
                                    temperatureC: number;
                                    vibrationMmS: number;
                                    spindleRpm: number;
                                    powerKw: number;
                                };
                            } | null;
                            samples?: number;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            stateNames: string[];
                            alertThresholds: {
                                watchBelow: number;
                                warningBelow: number;
                                criticalBelow: number;
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/model": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            method: "zscore" | "isolation_forest";
                            windowMinutes: number;
                            zscoreThreshold: number;
                            contamination: number;
                            minConfidence: number;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/maintenance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            machineId: string;
                            /** @enum {string} */
                            category: "inspection" | "adjustment" | "mechanical" | "electrical" | "lubrication";
                            at: number;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            machineId: string;
                            at: number;
                            level: 0 | 1 | 2 | 3;
                            messageKey: string;
                            value: string;
                            /** @enum {string} */
                            tone: "good" | "bad";
                            snapshot: {
                                availability: number | null;
                                anomalyScore: number | null;
                                confidence: number | null;
                                activeStates: number;
                                states: {
                                    index: number;
                                    share: number;
                                }[];
                                interval: string;
                            } | null;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/series": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    from: string;
                    to: string;
                    metric: "temperatureC" | "vibrationMmS" | "spindleRpm" | "powerKw";
                    bucket: "minute" | "hour";
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            at: number;
                            avg: number;
                            min: number;
                            max: number;
                            samples: number;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/machines/{id}/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    from: string;
                    to: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            at: number;
                            /** @enum {string} */
                            method: "zscore" | "isolation_forest";
                            anomalyScore: number;
                            healthScore: number;
                            confidence: number;
                            contributors: unknown;
                            modelVersion: string;
                        }[];
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
