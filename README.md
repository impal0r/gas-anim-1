# Gas animation: what makes an ideal gas?

This is an interactive applet that aims to show you what an "ideal gas" is, by showing you what it isn't. It's part of a developing project to improve A level physics teaching, and any constructive feedback is welcome.

To see it in action: go to https://impal0r.github.io/gas-anim-1/

### Playing with the code

This project was made using React.js, Vite, and Tailwind CSS. To set up a test environment, you need to have Node.js installed. Use the following steps to get started on a Linux environment:

0. Ensure `curl` and `git` are installed    
    `sudo apt-get update`
    `sudo apt-get install -y curl git`
1. Install Node.js 20 from Nodesource (later versions e.g. 22, 24 might work too)    
    `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`        
2. Enable Node.js corepack, which includes the pnpm package manager    
    `sudo corepack enable`    
3. Download the project files    
    `cd <location-where-you-want-the-project-directory>`    
    `git clone https://github.com/impal0r/gas-anim-1.git`    
    `cd gas-anim-1`
4. Install this project's dependencies    
    `pnpm fetch --frozen-lockfile`    
    `pnpm install --frozen-lockfile`    
5. Start the Node.js development server    
    `pnpm run dev`    
6. Open the project files in your favourite editor, and open `http://localhost:5173/gas-anim-1/` in your browser. The page should update automatically every time the code changes on disk. If it doesn't, just reload the page.
7. You might need to change `base` in `vite.config.ts` before deploying. This setting influences the URL that the server will respond on, e.g. cahnging it to `'/'` will mean the dev server will be at `http://localhost:5173/`.

### Feedback

I'm open to chat on Discord, please drop me a message and a friend request at the username `impal0r`, and mention "gas-anim-1" in the message.

### Credits

Thanks to Josep Vidal for his "Vital" template (https://vital.josepvidal.dev/).