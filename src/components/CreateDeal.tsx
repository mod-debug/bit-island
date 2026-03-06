import { useState } from 'react';
import { CreateOffer } from './CreateOffer.js';
import { CreateNftOffer } from './CreateNftOffer.js';

/**
 * Unified deal creation panel that combines token swaps and NFT deals
 * in a single tabbed interface.
 */

type DealTab = 'token' | 'nft';

export function CreateDeal(): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<DealTab>('token');

    return (
        <section className="otc-section" id="create">
            <div className="section-header">
                <div className="section-tag">Bit OTC Escrow</div>
                <h2 className="section-title">
                    Post a <span className="text-accent">Deal</span>
                </h2>
                <p className="section-sub">
                    Lock your assets in the Pirate&apos;s Code. The escrow holds them until a counterparty accepts.
                </p>
            </div>

            <div className="create-deal-panel">
                <div className="deal-tabs">
                    <button
                        type="button"
                        className={`deal-tabs__btn ${activeTab === 'token' ? 'deal-tabs__btn--active' : ''}`}
                        onClick={() => { setActiveTab('token'); }}
                    >
                        <span className="deal-tabs__icon">&#x1FA99;</span>
                        Token Swap
                        <span className="deal-tabs__desc">OP-20 &#8596; OP-20</span>
                    </button>
                    <button
                        type="button"
                        className={`deal-tabs__btn ${activeTab === 'nft' ? 'deal-tabs__btn--active' : ''}`}
                        onClick={() => { setActiveTab('nft'); }}
                    >
                        <span className="deal-tabs__icon">&#x1F5BC;</span>
                        NFT Deal
                        <span className="deal-tabs__desc">NFT &#8596; NFT / Token</span>
                    </button>
                </div>

                <div className="deal-panel">
                    {activeTab === 'token' ? <CreateOffer embedded /> : <CreateNftOffer embedded />}
                </div>
            </div>
        </section>
    );
}
