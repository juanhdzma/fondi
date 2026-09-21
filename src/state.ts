export type MovementType = 'aporte' | 'retiro';
export type ParticipantAction = 'agregar' | 'quitar' | 'ocultar' | 'mostrar';

export type FundSnapshot = {
  fecha: string;
  valor_total: number;
  precio_cuota: number;
  cuotas_circ: number;
  trm: number;
};

export type Movement = {
  fecha: string;
  persona: string;
  tipo: MovementType;
  monto: number;
  precio_cuota_dia: number;
  cuotas: number;
  monto_cop: number;
  trm_dia: number;
};

export type ParticipantEvent = {
  fecha: string;
  nombre: string;
  accion: ParticipantAction;
};

export const S: {
  trm: number | null;
  historial: FundSnapshot[];
  movimientos: Movement[];
  participantesLog: ParticipantEvent[];
  range: string;
  personaRange: string;
  heroMetric: string;
} = {
  trm: null,
  historial: [],
  movimientos: [],
  participantesLog: [],
  range: '1M',
  personaRange: 'todo',
  heroMetric: 'ganancia',
};
