/**
 * Footer Component
 *
 * A minimal footer with light/dark mode support.
 * Includes contact link and brief project information.
 */
"use client";

import { Separator } from "@/components/ui/separator";

const Footer = () => {
  return (
    <footer className="relative py-8 px-4 md:px-6 lg:px-8 bg-white dark:bg-[#0D0D0D] transition-colors duration-200">
      <Separator className="mb-8 bg-gray-200 dark:bg-white/[0.05]" />
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">

        {/* Left - Logo & Copyright */}
        <div className="flex items-center gap-3">
          <span className="text-gray-600 dark:text-gray-400 text-sm">
            © {new Date().getFullYear()} LiveCaps
          </span>
        </div>

        {/* Center - Links */}
        <div className="flex items-center gap-6">
          <a
            href="mailto:islam@uni.minerva.edu"
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200"
          >
            Contact
          </a>
        </div>

        {/* Right - Powered by */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-600">
          <a href="profile" className="hover:underline">Profile</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
