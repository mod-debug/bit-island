export function Footer(): React.JSX.Element {
    return (
        <footer className="footer">
            <div className="footer__inner">
                <div className="footer__brand">
                    <span className="footer__logo">
                        <span className="btc-b">&#8383;</span>it- <span className="text-accent">Island</span>
                    </span>
                    <p className="footer__tagline">
                        Built on OPNet L1
                    </p>
                </div>
                <div className="footer__links">
                    <div className="footer__col">
                        <span className="footer__col-title">Platform</span>
                        <a href="#browse" className="footer__link">Marketplace</a>
                        <a href="#create" className="footer__link">Post a Deal</a>
                        <a href="#browse" className="footer__link">My Deals</a>
                    </div>
                    <div className="footer__col">
                        <span className="footer__col-title">Community</span>
                        <a href="https://x.com/opnetbtc" className="footer__link" target="_blank" rel="noopener noreferrer">Twitter / X</a>
                        <a href="https://discord.gg/opnet" className="footer__link" target="_blank" rel="noopener noreferrer">Discord</a>
                    </div>
                    <div className="footer__col">
                        <span className="footer__col-title">Built With</span>
                        <a href="https://opnet.org" className="footer__link" target="_blank" rel="noopener noreferrer">OPNet Protocol</a>
                        <a href="https://vibecode.finance" className="footer__link" target="_blank" rel="noopener noreferrer">Vibecode Challenge</a>
                    </div>
                </div>
            </div>
            <div className="footer__bottom">
                <span>Bit-Island &copy; 2026 &mdash; Built for the OPNet Vibecode Challenge</span>
                <span className="footer__built-with">#opnetvibecode &bull; @opnetbtc</span>
            </div>
        </footer>
    );
}
