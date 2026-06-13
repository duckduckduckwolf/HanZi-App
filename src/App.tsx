import PracticeScreen from "./screens/PracticeScreen";
import { SAMPLE_WORDS } from "./data/sampleWords";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>汉字</h1>
      </header>
      <PracticeScreen words={SAMPLE_WORDS} />
    </div>
  );
}
