import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles/global.css';

createRoot(document.getElementById('root')!).render(<App />);
