import { TableNodeData, TableNodeId } from '@/types/tableNode.types';

// Тип для узла с id для использования в grid
export interface AgGridNode extends TableNodeData {
    id: string;
}

export function toGridNode(id: TableNodeId, nodeData: TableNodeData): AgGridNode {
    return { ...nodeData, id };
}
