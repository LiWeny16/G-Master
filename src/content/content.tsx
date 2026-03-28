import ReactDOM from 'react-dom/client';
import './content.css';
import '../i18n'; // Force i18n initialization
import ContentApp from './ContentApp';

const root = document.createElement('div');
root.id = 'crx-root';
document.body.appendChild(root);

ReactDOM.createRoot(root).render(
  <ContentApp />
);
