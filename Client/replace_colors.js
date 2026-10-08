const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

const replacements = [
  // 1. Remove redundant dark: prefixes for our custom variables
  { from: /dark:bg-trading-/g, to: 'bg-trading-' },
  { from: /dark:border-trading-/g, to: 'border-trading-' },
  { from: /dark:text-trading-/g, to: 'text-trading-' },
  { from: /dark:divide-trading-/g, to: 'divide-trading-' },
  { from: /dark:hover:bg-trading-/g, to: 'hover:bg-trading-' },
  { from: /dark:focus:ring-offset-trading-/g, to: 'focus:ring-offset-trading-' },

  // 2. Replace common light-mode fallbacks with theme variables
  { from: /bg-white/g, to: (match, offset, string) => {
      // Avoid replacing Lucide icon names or specific non-panel white backgrounds if any
      // But in this project, bg-white is mostly used for panels/containers
      return 'bg-trading-panel';
  }},
  { from: /bg-slate-50/g, to: 'bg-trading-bg' },
  { from: /bg-slate-100/g, to: 'bg-trading-panel/20' },
  { from: /border-slate-200/g, to: 'border-trading-border' },
  { from: /border-slate-300/g, to: 'border-trading-border' },
  
  // 3. Cleanup Layout.tsx specifically
  { from: /'bg-slate-100 text-slate-900'/g, to: "'bg-trading-bg text-slate-100'" },
];

function walk(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
}

walk(directoryPath, function(err, results) {
  if (err) throw err;
  results.filter(f => f.endsWith('.tsx') || f.endsWith('.css')).forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = content;
    
    replacements.forEach(r => {
      newContent = newContent.replace(r.from, r.to);
    });
    
    if (content !== newContent) {
      fs.writeFileSync(file, newContent);
      console.log(`Updated ${file}`);
    }
  });
});
