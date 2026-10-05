import { createRoot } from 'react-dom/client';
import { setGeometryVars } from '../render/fit.ts';
import { EditorApp } from './components/EditorApp.tsx';

setGeometryVars();
createRoot(document.getElementById('root') as HTMLElement).render(<EditorApp />);
