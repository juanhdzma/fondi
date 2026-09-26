import { motion } from 'motion/react';
import { springTransition, surfaceMotion } from '../motion';

export function LoadError({ message, hasData, onRetry }: { message: string; hasData: boolean; onRetry: () => void }) {
  if (hasData) {
    return (
      <div className="stale-note" role="alert">
        <span>No se pudo actualizar; se muestran los últimos datos cargados.</span>
        <button type="button" onClick={onRetry}>Reintentar</button>
      </div>
    );
  }
  return (
    <motion.section className="card state-card" role="alert" variants={surfaceMotion} initial="hidden" animate="visible" transition={springTransition}>
      <span className="state-icon error" aria-hidden="true">
        <svg className="ic" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg>
      </span>
      <h2>No pudimos cargar los datos</h2>
      <p>El servidor no respondió ({message}). Revisa la conexión e intenta de nuevo.</p>
      <button type="button" className="btn btn-dim" onClick={onRetry}>Reintentar</button>
    </motion.section>
  );
}

export function SetupSteps({ steps, onAction }: { steps: Array<{ label: string; done: boolean }>; onAction: () => void }) {
  const next = steps.findIndex(step => !step.done);
  return (
    <motion.section className="card state-card" variants={surfaceMotion} initial="hidden" animate="visible" transition={springTransition}>
      <h2>Configura el fondo en 3 pasos</h2>
      <ol className="setup-steps">
        {steps.map((step, index) => (
          <li key={step.label} className={step.done ? 'done' : index === next ? 'next' : ''}>
            <span className="setup-dot" aria-hidden="true">
              {step.done ? <svg className="ic" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4.5 4.5L19 7" /></svg> : index + 1}
            </span>
            <span>{step.label}{step.done && <span className="sr-only"> (hecho)</span>}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-green" onClick={onAction}>Continuar en Admin</button>
    </motion.section>
  );
}
