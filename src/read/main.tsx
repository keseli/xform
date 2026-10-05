import { createRoot } from 'react-dom/client';
import { setGeometryVars } from '../render/fit.ts';
import { ReadApp } from './ReadApp.tsx';

setGeometryVars();
const stage = document.getElementById('stage') as HTMLElement;
createRoot(stage).render(<ReadApp stage={stage} />);
