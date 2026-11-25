import { Seo } from '../lib/head.jsx';
import FilmModal from '../components/home/FilmModal.jsx';
import { Hero, Ecosystem } from '../home/v5-top.jsx';
import { Platform } from '../home/v5-platform.jsx';
import { HowItWorks, Scenarios, Industries, Trust, Cta } from '../home/v5-rest.jsx';

/* Home v5: a full redesign (docs/reference/home-v5.md). Story: who we are and
   proof → the identity problem → the platform → how it works → the risks it
   stops → industries → trust → talk to us. References: Design Monks (3D
   imagery, made as original renders), Eloqwnt (sheets, editorial hierarchy),
   Nullgate (blue cyber language, hairline grids, dotted map). */
export default function Home() {
  return (
    <div className="v5">
      <Seo path="/" description="Identity security for an AI-driven world. Deep Algorithms discovers, understands and secures every human, machine and AI agent identity in the enterprise. ISO 27001, SOC 2 Type II, ISO 42001, ISO 27701." />
      <Hero />
      <Ecosystem />
      <Platform />
      <HowItWorks />
      <Scenarios />
      <Industries />
      <Trust />
      <Cta />
      <FilmModal />
    </div>
  );
}
