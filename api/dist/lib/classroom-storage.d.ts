/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Storage - JSON file-based classroom and machine management
 */
import type { IClassroomStorage, CreateClassroomData, UpdateClassroomData } from '../types/storage.js';
interface StoredClassroom {
    id: string;
    name: string;
    display_name: string;
    default_group_id: string | null;
    active_group_id: string | null;
    created_at: string;
    updated_at: string;
}
interface StoredMachine {
    id: string;
    hostname: string;
    classroom_id: string;
    version: string;
    last_seen: string;
    created_at: string;
    updated_at: string;
}
interface ClassroomWithCount extends StoredClassroom {
    machine_count: number;
}
interface WhitelistUrlResult {
    url: string;
    group_id: string;
    classroom_id: string;
    classroom_name: string;
    source: 'manual' | 'schedule' | 'default';
}
interface ClassroomStats {
    classrooms: number;
    machines: number;
    classroomsWithActiveGroup: number;
}
export declare function getAllClassrooms(): ClassroomWithCount[];
export declare function getClassroomById(id: string): StoredClassroom | null;
export declare function getClassroomByName(name: string): StoredClassroom | null;
export declare function createClassroom(classroomData: CreateClassroomData & {
    defaultGroupId?: string;
}): StoredClassroom;
export declare function updateClassroom(id: string, updates: UpdateClassroomData & {
    defaultGroupId?: string;
}): StoredClassroom | null;
export declare function setActiveGroup(id: string, groupId: string | null): StoredClassroom | null;
export declare function getCurrentGroupId(id: string): string | null;
export declare function deleteClassroom(id: string): boolean;
export declare function getAllMachines(): StoredMachine[];
export declare function getMachinesByClassroom(classroomId: string): StoredMachine[];
export declare function getMachineByHostname(hostname: string): StoredMachine | null;
export declare function registerMachine(machineData: {
    hostname: string;
    classroomId: string;
    version?: string;
}): StoredMachine;
export declare function updateMachineLastSeen(hostname: string): StoredMachine | null;
export declare function deleteMachine(hostname: string): boolean;
export declare function removeMachinesByClassroom(classroomId: string): number;
export declare function getWhitelistUrlForMachine(hostname: string): WhitelistUrlResult | null;
export declare function getStats(): ClassroomStats;
export declare const classroomStorage: IClassroomStorage;
export default classroomStorage;
//# sourceMappingURL=classroom-storage.d.ts.map