import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.js';
import { HubLanding } from './components/HubLanding.js';
import { Hero } from './components/Hero.js';
import { IslandStatsBar } from './components/IslandStats.js';
import { OffersList } from './components/OffersList.js';
import { CreateDeal } from './components/CreateDeal.js';
import { About } from './components/About.js';
import { Footer } from './components/Footer.js';

import { ToastProvider, ToastBridge } from './components/Toast.js';
import { VestingDashboard } from './components/vesting/VestingDashboard.js';
import { DeployPage } from './components/DeployPage.js';
import { AutoVaultDashboard } from './components/autovault/AutoVaultDashboard.js';
import { FirefliesCanvas } from './components/autovault/FirefliesCanvas.js';
import './styles/index.css';

function TradingPostPage(): React.JSX.Element {
    return (
        <main className="otc-page">
            <FirefliesCanvas />
            <Hero />
            <IslandStatsBar />
            <OffersList />
            <CreateDeal />
            <About />
        </main>
    );
}

export default function App(): React.JSX.Element {
    return (
        <BrowserRouter>
            <ToastProvider>
                <ToastBridge />
                <div className="app">
                    <Navbar />
                    <Routes>
                        <Route path="/" element={<HubLanding />} />
                        <Route path="/otc" element={<TradingPostPage />} />
                        <Route path="/vesting" element={<VestingDashboard />} />
                        <Route path="/vault" element={<AutoVaultDashboard />} />
                        <Route path="/deploy" element={<DeployPage />} />
                    </Routes>
                    <Footer />
                </div>
            </ToastProvider>
        </BrowserRouter>
    );
}
