// Isolate Instagram availability for layout, lazy-loading and recovery checks.
// Set BN_INSTAGRAM_LIVE=1 to additionally check the real public profile frame.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
  const base=process.env.BN_PREVIEW_URL || 'http://127.0.0.1:8765/';
  try {
    for(const width of [320,390,768,1286]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      let blocked=true, requests=0;
      await page.route('https://www.instagram.com/embed.js',route=>{
        requests++;
        if(blocked) return route.abort();
        return route.fulfill({contentType:'text/javascript',body:`window.instgrm={Embeds:{process(){const q=document.querySelector('blockquote.instagram-media');if(!q)return;const f=document.createElement('iframe');f.className='instagram-media';f.srcdoc='<p>Instagram profile fixture</p>';f.style.height='400px';q.replaceWith(f);}}};`});
      });
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(500);
      assert.equal(requests,0,'Instagram loads before Impact is approached');
      await page.locator('#impactInstagram').scrollIntoViewIfNeeded();
      await page.locator('#instagramRetry:not([hidden])').waitFor();
      assert.match(await page.locator('#instagramStatus').innerText(),/couldn’t load/);
      blocked=false;
      await page.locator('#instagramRetry').click();
      await page.waitForFunction(()=>document.querySelector('#instagramStatus').textContent==='');
      assert.equal(await page.locator('#instagramEmbed iframe').getAttribute('title'),'BetterNature posts on Instagram');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow at ${width}`);
      await page.waitForFunction(() => document.querySelector('#instagramEmbed').dataset.frameReady === 'true');
      const fit = await page.locator('#instagramEmbed').evaluate(el => {
        const frame = el.querySelector('iframe');
        return {width:el.clientWidth,frameWidth:frame.getBoundingClientRect().width,height:el.getBoundingClientRect().height,frameHeight:frame.getBoundingClientRect().height};
      });
      assert.ok(Math.abs(fit.width-fit.frameWidth)<2, 'feed width does not fit its frame');
      assert.ok(Math.abs(fit.height-fit.frameHeight)<2, `feed has blank space or clipped height: ${JSON.stringify(fit)}`);
      assert.equal(await page.locator('.chapters__insights').evaluate(e=>e.open),width>767);
      if(width<768){await page.locator('.chapters__insights > summary').click();assert.equal(await page.locator('.chapters__insights').evaluate(e=>e.open),true);}
      await page.close();console.log(`${width}px: lazy load, blocked embed, retry, accessible frame and overflow checks passed`);
    }
    if(process.env.BN_INSTAGRAM_LIVE){
      const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
      await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#impactInstagram').scrollIntoViewIfNeeded();
      await page.frameLocator('#instagramEmbed iframe').getByText('official.better.nature',{exact:true}).first().waitFor({timeout:60000});
      await page.locator('#impactInstagram').screenshot({path:'/tmp/bn-instagram-live.png'});
      console.log('Real official.better.nature profile rendered');
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
