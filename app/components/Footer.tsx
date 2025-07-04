/**
 * Footer Component
 * 
 * A minimal footer containing links to project resources and attribution.
 * Includes GitHub repository link and brief project information.
 */
"use client";

interface FooterProps {
  forceDark?: boolean;
}

const Footer = ({ forceDark = false }: FooterProps) => {
  const footerClasses = forceDark 
    ? "bg-[#0b0b0c] border-t border-gray-700 py-6 px-4 md:px-6 lg:px-8"
    : "bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 py-6 px-4 md:px-6 lg:px-8 transition-colors duration-200";
  
  const textClasses = forceDark
    ? "text-gray-400"
    : "text-gray-600 dark:text-gray-400";
    
  const linkClasses = forceDark
    ? "text-gray-400 hover:text-white"
    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";
    
  const brandClasses = forceDark
    ? {
        deepgram: "text-blue-400 font-medium",
        deepl: "text-green-400 font-medium"
      }
    : {
        deepgram: "text-blue-600 dark:text-blue-400 font-medium",
        deepl: "text-green-600 dark:text-green-400 font-medium"
      };

  return (
    <footer className={footerClasses}>
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className={`${textClasses} text-sm text-center md:text-left`}>
          <p>
            Built with{" "}
            <span className={brandClasses.deepgram}>Deepgram</span> and{" "}
            <span className={brandClasses.deepl}>DeepL</span>
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/islamborghini"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 ${linkClasses}`}
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>GitHub</span>
          </a>
          
          <div className={`${forceDark ? 'text-gray-500' : 'text-gray-500 dark:text-gray-500'} text-sm`}>
            <span>LiveCaps v1.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
