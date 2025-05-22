// improved-game-news-crawler.js - GitHub Actions 버전
const puppeteer = require('puppeteer');
const Parser = require('rss-parser');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const path = require('path');

// RSS 파서 초기화
const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0' }
});

// 현재 날짜를 YYYY-MM-DD 형식으로 반환하는 함수
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// N일 전 날짜를 YYYY-MM-DD 형식으로 반환하는 함수
function getDateBefore(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 어제 날짜를 YYYY-MM-DD 형식으로 반환하는 함수
function getYesterday() {
  return getDateBefore(1);
}

// 오늘 또는 어제 날짜인지 확인하는 함수 (수정됨)
function isTodayOrYesterday(dateStr) {
  if (!dateStr) return false;

  const currentYear = new Date().getFullYear();
  let normalizedDate = dateStr;

  // MM 월 DD 일 형식 처리 (예: "05 월 18 일")
  if (/\d{1,2}\s*월\s*\d{1,2}\s*일/.test(dateStr)) {
    const match = dateStr.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (match) {
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      normalizedDate = `${currentYear}-${month}-${day}`;
    }
  }

  // MM-DD 형식 보정
  if (/^\d{1,2}[-/.]\d{1,2}$/.test(dateStr)) {
    const [month, day] = dateStr.replace(/[/.]/g, '-').split('-');
    normalizedDate = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const today = getCurrentDate();
  const yesterday = getYesterday();

  console.log(`날짜 확인: ${dateStr} -> ${normalizedDate} (today: ${today}, yesterday: ${yesterday})`);
  return normalizedDate === today || normalizedDate === yesterday;
}

// 상대적 또는 절대 날짜 파싱 함수 (개선됨)
function parseRelativeOrAbsoluteDate(text) {
  if (!text) return null;
  
  const now = new Date();

  // 중국어 상대 시간 표현 (예: 1小时前, 2天前)
  const hourMatch = text.match(/(\d+)[\s]*小时前/);
  if (hourMatch) {
    return new Date(now.getTime() - parseInt(hourMatch[1]) * 60 * 60 * 1000);
  }

  const minuteMatch = text.match(/(\d+)[\s]*分钟前/);
  if (minuteMatch) {
    return new Date(now.getTime() - parseInt(minuteMatch[1]) * 60 * 1000);
  }

  const dayMatch = text.match(/(\d+)[\s]*天前/);
  if (dayMatch) {
    return new Date(now.getTime() - parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000);
  }

  // 대만어 상대 시간 표현 (예: 1小時前, 2天前)
  const twHourMatch = text.match(/(\d+)[\s]*小時前/);
  if (twHourMatch) {
    return new Date(now.getTime() - parseInt(twHourMatch[1]) * 60 * 60 * 1000);
  }

  const twMinuteMatch = text.match(/(\d+)[\s]*分鐘前/);
  if (twMinuteMatch) {
    return new Date(now.getTime() - parseInt(twMinuteMatch[1]) * 60 * 1000);
  }

  const twDayMatch = text.match(/(\d+)[\s]*天前/);
  if (twDayMatch) {
    return new Date(now.getTime() - parseInt(twDayMatch[1]) * 24 * 60 * 60 * 1000);
  }

  // 절대 날짜 형식 (예: 2024-05-20 14:30)
  const absMatch = text.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
  if (absMatch) {
    return new Date(`${absMatch[1]}-${absMatch[2]}-${absMatch[3]}T${absMatch[4]}:${absMatch[5]}:00+08:00`);
  }

  // YYYY년MM월DD일 형식
  const cnDateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnDateMatch) {
    const year = cnDateMatch[1];
    const month = cnDateMatch[2].padStart(2, '0');
    const day = cnDateMatch[3].padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  }

  // MM월DD일 형식 (연도 없음)
  const shortDateMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (shortDateMatch) {
    const year = now.getFullYear();
    const month = shortDateMatch[1].padStart(2, '0');
    const day = shortDateMatch[2].padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  }

  // YYYY-MM-DD 형식
  const isoDateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    return new Date(`${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}T00:00:00+08:00`);
  }

  // MM-DD 형식 (연도 없음)
  const shortIsoMatch = text.match(/(\d{2})-(\d{2})/);
  if (shortIsoMatch) {
    const year = now.getFullYear();
    return new Date(`${year}-${shortIsoMatch[1]}-${shortIsoMatch[2]}T00:00:00+08:00`);
  }

  return null;
}

// 24시간 이내인지 확인하는 함수
function isWithin24Hours(date) {
  if (!date) return false;
  return (new Date() - date) <= 24 * 60 * 60 * 1000;
}

// 24시간 이내 기사 확인 (개선됨)
function isWithin24HoursFromString(dateStr) {
  if (!dateStr) return false;
  
  // 상대적 시간 표현 (예: 1小时前, 2天前, 몇시간 전 등)
  const relativeMatch = dateStr.match(/(\d+)(分钟|小时|天|周|月)前/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    
    if (unit === '分钟' || unit === '小时') return true; // 분/시간 단위는 24시간 내
    if (unit === '天' && value <= 1) return true;  // 1일 이내
    
    return false;
  }
  
  // 대만어 상대적 시간 표현
  const twRelativeMatch = dateStr.match(/(\d+)(分鐘|小時|天|週|月)前/);
  if (twRelativeMatch) {
    const value = parseInt(twRelativeMatch[1], 10);
    const unit = twRelativeMatch[2];
    
    if (unit === '分鐘' || unit === '小時') return true; // 분/시간 단위는 24시간 내
    if (unit === '天' && value <= 1) return true;  // 1일 이내
    
    return false;
  }
  
  // 절대 날짜는 parseRelativeOrAbsoluteDate로 파싱 후 isWithin24Hours로 확인
  const parsedDate = parseRelativeOrAbsoluteDate(dateStr);
  if (parsedDate) {
    return isWithin24Hours(parsedDate);
  }
  
  // 절대 날짜는 isTodayOrYesterday로 확인 (기존 방식 유지)
  return isTodayOrYesterday(dateStr);
}

// RSS 크롤링 함수 (RSS의 content:encoded 직접 추출)
async function crawlRSS() {
  console.log('\n🔄 RSS 크롤링 시작: GameLook');
  
  try {
    // RSS 피드 파싱 설정 개선
    const customParser = new Parser({
      headers: { 'User-Agent': 'Mozilla/5.0' },
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['content', 'contentEncoded'] // 대체 필드
        ]
      }
    });

    const feed = await customParser.parseURL('http://www.gamelook.com.cn/feed/');
    const now = new Date();

    // 24시간 이내 기사로 변경
    const recentArticles = feed.items.filter(item => {
      const pubDate = new Date(item.pubDate);
      const timeDiff = now - pubDate;
      const within24Hours = timeDiff <= 24 * 60 * 60 * 1000;
      
      if (within24Hours) {
        console.log(`RSS 기사: ${item.title} - 발행일: ${item.pubDate} (${(timeDiff / (60 * 60 * 1000)).toFixed(1)}시간 전)`);
      }
      
      return within24Hours;
    });

    console.log(`📋 RSS에서 24시간 이내 ${recentArticles.length}건 발견, 전체 본문 추출...`);

    // RSS에서 직접 전체 본문 추출
    const detailedArticles = recentArticles.map(item => {
      console.log(`🔍 RSS 기사 처리 중: ${item.title}`);
      
      // content:encoded 필드에서 전체 본문 추출
      let fullContent = '';
      
      if (item.contentEncoded) {
        // HTML 태그 제거하고 텍스트만 추출
        const htmlContent = item.contentEncoded;
        
        // 간단한 HTML 파싱으로 텍스트 추출
        fullContent = htmlContent
          .replace(/<style[^>]*>.*?<\/style>/gis, '') // style 태그 제거
          .replace(/<script[^>]*>.*?<\/script>/gis, '') // script 태그 제거
          .replace(/<img[^>]*>/gi, '') // img 태그 제거
          .replace(/<a[^>]*>/gi, '') // a 태그 시작 제거
          .replace(/<\/a>/gi, '') // a 태그 끝 제거
          .replace(/<br\s*\/?>/gi, '\n') // br 태그를 줄바꿈으로
          .replace(/<\/p>/gi, '\n\n') // p 태그 끝을 줄바꿈으로
          .replace(/<[^>]+>/g, '') // 나머지 HTML 태그 제거
          .replace(/&nbsp;/g, ' ') // &nbsp; 를 공백으로
          .replace(/&ldquo;|&rdquo;/g, '"') // 따옴표 변환
          .replace(/&lsquo;|&rsquo;/g, "'") // 작은따옴표 변환
          .replace(/&amp;/g, '&') // &amp; 변환
          .replace(/&lt;/g, '<') // &lt; 변환
          .replace(/&gt;/g, '>') // &gt; 변환
          .replace(/\n\s*\n/g, '\n\n') // 연속된 빈 줄 정리
          .trim();
      }
      
      // content가 없으면 contentSnippet이나 description 사용
      if (!fullContent) {
        fullContent = item.content || item.contentSnippet || item.description || '본문을 추출할 수 없습니다.';
      }
      
      // 기사 요약 생성
      let summary = '';
      if (fullContent && fullContent.length > 200) {
        summary = fullContent.substring(0, 300).trim();
        if (summary.length === 300) {
          const lastPeriodIndex = summary.lastIndexOf('。');
          if (lastPeriodIndex > 150) {
            summary = summary.substring(0, lastPeriodIndex + 1);
          } else {
            const lastSpaceIndex = summary.lastIndexOf(' ');
            if (lastSpaceIndex > 150) {
              summary = summary.substring(0, lastSpaceIndex);
            }
          }
        }
        summary += '...';
      } else {
        summary = item.contentSnippet || fullContent.substring(0, 200) + '...';
      }
      
      return {
        title: item.title,
        url: item.link,
        date: item.pubDate,
        summary: summary,
        content: fullContent,
        image: '', // RSS에서는 이미지 정보가 제한적
        source: 'GameLook',
        region: '중국'
      };
    });

    console.log(`✅ GameLook RSS 수집 완료: ${detailedArticles.length}건 (전체 본문 포함)`);
    return detailedArticles;
  } catch (err) {
    console.error('❌ GameLook RSS 수집 오류:', err.message);
    return [];
  }
}

// 웹페이지 크롤링 함수
async function crawlWebsites(browser) {
  console.log('\n🔄 웹페이지 크롤링 시작');
  
  // 크롤링할 사이트 목록 (GNN 선택자 개선)
  const sites = [
    // 중국 사이트
    {
      name: 'Youxituoluo',
      url: 'https://www.youxituoluo.com/',
      region: '중국',
      selectors: {
        articles: ['.news-item'],
        title: ['.news-title'],
        link: ['a'],
        date: ['.item-time'],
        content: ['.news-detail'],
        adSelector: ['.ad', '.sponsored']
      },
      filterBy: '24h'  // 24시간 이내 기사만 수집하는 설정 추가
    },
    // 대만 사이트
    {
      name: '4Gamers',
      url: 'https://www.4gamers.com.tw/news/category/352/%E9%81%8A%E6%88%B2%E8%B3%87%E8%A8%8A',
      region: '대만',
      selectors: {
        articles: ['.news-list li', '.news-items .news-item', '.article-list .article-item', '.card-list .card', '.news-card'],
        title: ['.news-title', '.article-title', '.card-title', 'h3', 'h2', '.title a'],
        link: ['.news-title a', '.article-title a', '.card-title a', 'h3 a', 'h2 a', 'a.card-link', '.title a'],
        date: ['.news-date', '.article-date', '.card-date', '.time', '.date', '.meta-date', '.publish-time', 'time', '.datetime'],
        content: ['.article-content', '.news-content', '.content', '.editor-content'],
        adSelector: ['.adunit', '.is-gad', '.is-ad', '.advertisement', '[class*="ad-"]', '[id*="ad-"]', '[class*="sponsored"]']
      }
    },
    {
      name: 'GNN',
      url: 'https://gnn.gamer.com.tw/',
      region: '대만',
      selectors: {
        // 개선된 GNN 선택자
        articles: [
          'div:has(a[href*="detail.php?sn="])', // 상세 페이지 링크를 포함한 div
          '.GN-lbox2', '.BH-lbox', '.GN-lbox', '.news-list li', '.article-list li'
        ],
        title: [
          'a[href*="detail.php?sn="]', // 직접 링크 텍스트
          'h1', 'h2', '.news-title', '.title', 'h3'
        ],
        link: [
          'a[href*="detail.php?sn="]', // 상세 페이지 링크 직접 선택
          'h1 a', 'h2 a', '.news-title a', '.title a', 'h3 a', 'a.title'
        ],
        date: [
          '.time', '.date', '.news-date', '.article-date', '.meta-date', 
          'time', '.GN-lbox3 .ST1', '.ST1', '.article-info .date',
          '.publish-time', '.datetime'
        ],
        content: ['.GN-lbox3', '.content', '.news-content', '.article-content'],
        adSelector: ['[class*="ad-"]', '[id*="ad-"]', '.adtext', '.adunit', '[data-ad]']
      }
    }
  ];
  
  let results = [];
  let totalArticles = 0;
  let successfulSites = 0;
  
  try {
    for (const site of sites) {
      console.log(`\n🔎 [${site.name} - ${site.region}] 크롤링 시작: ${site.url}`);
      
      try {
        const page = await browser.newPage();
        
        // 봇 감지 회피를 위한 설정
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0'
        ];
        
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(randomUserAgent);
        
        // 지역에 따라 Accept-Language 설정
        const acceptLanguage = site.region === '중국' ? 'zh-CN,zh;q=0.9,en;q=0.8' : 'zh-TW,zh;q=0.9,en;q=0.8';
        await page.setExtraHTTPHeaders({
          'Accept-Language': acceptLanguage,
          'Referer': 'https://www.google.com/'
        });
        
        // 쿠키 및 캐시 활성화
        await page.setCacheEnabled(true);
        
        // 페이지 타임아웃 증가
        await page.setDefaultNavigationTimeout(60000);
        
        // 페이지 로드
        console.log(`🌐 페이지 접근 중...`);
        await page.goto(site.url, { 
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        console.log(`✅ 페이지 로드됨`);
        
        // 자바스크립트 실행을 위한 대기
        await new Promise(r => setTimeout(r, 5000));
        
        // 기사 추출
        const articles = await extractArticles(page, site);
        console.log(`📄 ${articles.length}개 기사 발견`);
        
        // 성공적인 크롤링 횟수 증가
        if (articles.length > 0) {
          successfulSites++;
        }
        
        // 기사 상세 내용 추출
        const recentArticles = await extractDetailedContent(browser, articles, site);
        console.log(`📝 ${recentArticles.length}개 최근 기사 추출 완료`);
        
        // 결과에 추가
        results = [...results, ...recentArticles];
        totalArticles += recentArticles.length;
        
        await page.close();
        
      } catch (error) {
        console.error(`❌ [${site.name}] 사이트 크롤링 중 오류 발생:`, error.message);
      }
      
      // 다음 사이트 크롤링 전 잠시 대기
      console.log(`⏱️ 다음 사이트 크롤링 전 잠시 대기...`);
      await new Promise(r => setTimeout(r, 5000));
    }
    
  } catch (error) {
    console.error('❌ 웹페이지 크롤링 중 오류 발생:', error.message);
  }
  
  console.log(`\n📊 웹페이지 크롤링 - 총 최근 기사 수: ${totalArticles}`);
  console.log(`📊 웹페이지 크롤링 - 성공한 사이트 수: ${successfulSites}/${sites.length}`);
  
  return results;
}

// 기사 목록 추출 함수 (개선됨)
async function extractArticles(page, site) {
  const articles = [];
  
  try {
    // GNN 사이트를 위한 특별 처리
    if (site.name === 'GNN') {
      console.log('🔍 GNN 전용 추출 방법 시도...');
      
      // GNN의 특별한 구조를 처리
      const gnnArticles = await page.evaluate(() => {
        const articles = [];
        
        // 방법 1: 날짜 텍스트 기준으로 찾기
        const dateElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent.trim();
          return /\d{2}\s*월\s*\d{2}\s*일/.test(text) && el.textContent.length < 20;
        });
        
        console.log('발견된 날짜 요소:', dateElements.length);
        
        dateElements.forEach(dateEl => {
          const dateText = dateEl.textContent.trim();
          console.log('날짜 텍스트:', dateText);
          
          // 해당 날짜 이후의 형제 요소들에서 기사 링크 찾기
          let current = dateEl.nextElementSibling;
          let count = 0;
          
          while (current && count < 10) { // 최대 10개 요소까지 확인
            const links = current.querySelectorAll('a[href*="detail.php?sn="]');
            
            links.forEach(link => {
              if (link.textContent.trim().length > 10) {
                // 링크가 상대 경로인 경우 절대 경로로 변환
                let url = link.href;
                if (url.startsWith('//')) {
                  url = 'https:' + url;
                }
                
                articles.push({
                  title: link.textContent.trim(),
                  url: url,
                  date: dateText,
                  source: 'GNN-special'
                });
              }
            });
            
            current = current.nextElementSibling;
            count++;
          }
          
          // 같은 부모 내의 다른 자식들도 확인
          if (dateEl.parentElement) {
            const siblings = Array.from(dateEl.parentElement.children);
            siblings.forEach(sibling => {
              const links = sibling.querySelectorAll('a[href*="detail.php?sn="]');
              links.forEach(link => {
                if (link.textContent.trim().length > 10) {
                  let url = link.href;
                  if (url.startsWith('//')) {
                    url = 'https:' + url;
                  }
                  
                  articles.push({
                    title: link.textContent.trim(),
                    url: url,
                    date: dateText,
                    source: 'GNN-special'
                  });
                }
              });
            });
          }
        });
        
        // 방법 2: 모든 게임 관련 링크 수집
        const allLinks = Array.from(document.querySelectorAll('a[href*="detail.php?sn="]'));
        allLinks.forEach(link => {
          if (link.textContent.trim().length > 10) {
            let url = link.href;
            if (url.startsWith('//')) {
              url = 'https:' + url;
            }
            
            // 근처에서 날짜 찾기
            let dateText = '';
            let current = link.parentElement;
            let depth = 0;
            
            while (current && depth < 3) {
              const text = current.textContent;
              const dateMatch = text.match(/\d{2}\s*월\s*\d{2}\s*일/);
              if (dateMatch) {
                dateText = dateMatch[0];
                break;
              }
              current = current.parentElement;
              depth++;
            }
            
            // 이전 형제에서도 날짜 찾기
            if (!dateText) {
              let sibling = link.parentElement?.previousElementSibling;
              let siblingCount = 0;
              
              while (sibling && siblingCount < 5) {
                const text = sibling.textContent;
                const dateMatch = text.match(/\d{2}\s*월\s*\d{2}\s*일/);
                if (dateMatch) {
                  dateText = dateMatch[0];
                  break;
                }
                sibling = sibling.previousElementSibling;
                siblingCount++;
              }
            }
            
            articles.push({
              title: link.textContent.trim(),
              url: url,
              date: dateText || '',
              source: 'GNN-fallback'
            });
          }
        });
        
        return articles;
      });
      
      console.log(`GNN 특별 처리로 ${gnnArticles.length}개 기사 발견`);
      
      // 중복 제거
      const uniqueArticles = [];
      const seen = new Set();
      
      gnnArticles.forEach(article => {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          uniqueArticles.push({
            ...article,
            source: site.name,
            region: site.region
          });
        }
      });
      
      return uniqueArticles.slice(0, 30); // 최대 30개
    }
    
    // 기존 방법으로 다른 사이트들 처리
    for (const articlesSelector of site.selectors.articles) {
      try {
        console.log(`🔍 선택자 시도: ${articlesSelector}`);
        
        // 선택자 존재 여부 확인
        const hasSelector = await page.evaluate((selector) => {
          return document.querySelectorAll(selector).length > 0;
        }, articlesSelector);
        
        if (hasSelector) {
          console.log(`✅ 선택자 발견: ${articlesSelector}`);
          
          // 기사 추출
          const extractedArticles = await page.evaluate((articlesSelector, titleSelectors, linkSelectors, dateSelectors) => {
            const articleElements = document.querySelectorAll(articlesSelector);
            
            return Array.from(articleElements).map(article => {
              // 제목 추출
              let title = '';
              for (const titleSelector of titleSelectors) {
                const titleElement = article.querySelector(titleSelector);
                if (titleElement) {
                  title = titleElement.innerText.trim();
                  break;
                }
              }
              
              // 링크 추출
              let url = '';
              for (const linkSelector of linkSelectors) {
                const linkElement = article.querySelector(linkSelector);
                if (linkElement && linkElement.href) {
                  url = linkElement.href;
                  break;
                }
              }
              
              // 직접 링크가 없는 경우, 전체 요소가 링크인지 확인
              if (!url && article.tagName === 'A' && article.href) {
                url = article.href;
              }
              
              // 상대 경로인 경우 절대 경로로 변환
              if (url && url.startsWith('/')) {
                const origin = window.location.origin;
                url = `${origin}${url}`;
              }
              
              // 날짜 추출
              let date = '';
              for (const dateSelector of dateSelectors) {
                const dateElement = article.querySelector(dateSelector);
                if (dateElement) {
                  date = dateElement.innerText.trim();
                  if (!date) {
                    const dataDate = dateElement.getAttribute('data-date') || 
                                     dateElement.getAttribute('datetime') || 
                                     dateElement.getAttribute('date');
                    if (dataDate) date = dataDate;
                  }
                  break;
                }
              }
              
              // 시간 관련 태그 확인
              if (!date) {
                const timeElement = article.querySelector('time');
                if (timeElement) {
                  date = timeElement.getAttribute('datetime') || 
                         timeElement.getAttribute('data-time') || 
                         timeElement.innerText.trim();
                }
              }
              
              // 메타 정보에서 찾기
              if (!date) {
                const metaElement = article.querySelector('.meta, .info, .date-info, .article-meta, .post-meta');
                if (metaElement) {
                  date = metaElement.innerText.trim();
                }
              }
              
              return { title, url, date };
            }).filter(article => article.title && article.url);
          }, articlesSelector, site.selectors.title, site.selectors.link, site.selectors.date);
          
          if (extractedArticles.length > 0) {
            // 광고 필터링
            const filteredArticles = await page.evaluate((articles, adSelectors) => {
              return articles.filter(article => {
                const title = article.title.toLowerCase();
                const url = article.url.toLowerCase();
                
                const adKeywords = ['广告', '推广', 'ad', 'sponsored', '推薦', '廣告', 'promotion'];
                if (adKeywords.some(keyword => title.includes(keyword) || url.includes(keyword))) {
                  return false;
                }
                
                return true;
              });
            }, extractedArticles, site.selectors.adSelector || []);
            
            console.log(`🧹 광고 필터링: ${extractedArticles.length} -> ${filteredArticles.length}`);
            articles.push(...filteredArticles);
            break;
          }
        }
      } catch (error) {
        console.error(`❌ 선택자 '${articlesSelector}' 사용 중 오류:`, error.message);
      }
    }
    
    // 일반적인 방법 실패 시 a 태그에서 직접 추출 시도
    if (articles.length === 0) {
      console.log('🔍 일반적인 방법 실패. a 태그에서 직접 추출 시도...');
      
      const fallbackArticles = await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        
        return Array.from(links)
          .filter(link => {
            const text = link.innerText.trim();
            return text.length > 10 && link.href && link.href.startsWith('http');
          })
          .map(link => {
            let date = '';
            const parentElement = link.parentElement;
            if (parentElement) {
              const timeElement = parentElement.querySelector('time');
              if (timeElement) {
                date = timeElement.getAttribute('datetime') || 
                       timeElement.getAttribute('data-time') || 
                       timeElement.innerText.trim();
              }
              
              const dateElement = parentElement.querySelector('.time, .date, .meta-date, .publish-time');
              if (dateElement && !date) {
                date = dateElement.innerText.trim();
              }
            }
            
            return {
              title: link.innerText.trim(),
              url: link.href,
              date: date
            };
          })
          .slice(0, 30);
      });
      
      const filteredFallbackArticles = await page.evaluate((articles) => {
        return articles.filter(article => {
          const title = article.title.toLowerCase();
          const url = article.url.toLowerCase();
          
          const adKeywords = ['广告', '推广', 'ad', 'sponsored', '推薦', '廣告', 'promotion'];
          if (adKeywords.some(keyword => title.includes(keyword) || url.includes(keyword))) {
            return false;
          }
          
          return true;
        });
      }, fallbackArticles);
      
      if (filteredFallbackArticles.length > 0) {
        console.log(`✅ 대체 방법으로 ${filteredFallbackArticles.length}개 기사 발견`);
        
        // Youxituoluo 사이트는 모든 기사를 일단 추가 (필터링 건너뛰기)
        if (site.name === 'Youxituoluo') {
          console.log(`🕒 Youxituoluo 사이트는 모든 기사를 일단 추가합니다.`);
          articles.push(...filteredFallbackArticles);
        } else if (site.filterBy === '24h') {
          // 다른 사이트의 경우 기존 24시간 필터링 적용
          const finalFallback = filteredFallbackArticles.filter(article => {
            const parsed = parseRelativeOrAbsoluteDate(article.date);
            return isWithin24Hours(parsed);
          });
          console.log(`🕒 24시간 필터링 후: ${finalFallback.length}개`);
          articles.push(...finalFallback);
        } else {
          articles.push(...filteredFallbackArticles);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 기사 추출 중 오류 발생:', error.message);
  }
  
  return articles.slice(0, 30).map(article => ({
    ...article,
    source: site.name,
    region: site.region
  }));
}

// 기사 상세 내용 추출 함수 (개선됨)
async function extractDetailedContent(browser, articles, site) {
  const detailedArticles = [];
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`🔍 (${i+1}/${articles.length}) 기사 상세 내용 크롤링 중: ${article.title}`);
    
    try {
      const page = await browser.newPage();
      
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0'
      ];
      
      const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      await page.setUserAgent(randomUserAgent);
      
      const acceptLanguage = site.region === '중국' ? 'zh-CN,zh;q=0.9,en;q=0.8' : 'zh-TW,zh;q=0.9,en;q=0.8';
      await page.setExtraHTTPHeaders({
        'Accept-Language': acceptLanguage,
        'Referer': site.url
      });
      
      await page.goto(article.url, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      await new Promise(r => setTimeout(r, 3000));
      
      // 날짜 추출 개선 (상세 페이지에서)
      let date = article.date;
      if (!date || date.length < 2) {
        try {
          date = await page.evaluate(() => {
            const dateSelectors = [
              '.date', '.time', '.article-date', '.post-date', '.meta-date', 
              '.article-time', '.publish-time', '.publish-date', '.entry-date',
              '.news-time', '.news-date', '.info-time', '.info-date',
              '.GN-lbox3 .ST1', '.ST1', '.article-info .date'
            ];
            
            for (const selector of dateSelectors) {
              const element = document.querySelector(selector);
              if (element) {
                return element.innerText.trim();
              }
            }
            
            const timeElement = document.querySelector('time');
            if (timeElement) {
              return timeElement.getAttribute('datetime') || 
                     timeElement.getAttribute('data-time') || 
                     timeElement.innerText.trim();
            }
            
            const metaElement = document.querySelector('meta[property="article:published_time"]');
            if (metaElement) {
              return metaElement.getAttribute('content');
            }
            
            const metaBlock = document.querySelector('.meta, .article-meta, .post-meta, .entry-meta, .info, .news-info, .article-info');
            if (metaBlock) {
              const text = metaBlock.innerText;
              const dateRegex = /\d{4}[年\/\-\.\s]?\d{1,2}[月\/\-\.\s]?\d{1,2}[日]?/;
              const match = text.match(dateRegex);
              if (match) return match[0];
              
              const shortDateRegex = /\d{1,2}[-\.\/]\d{1,2}/;
              const shortMatch = text.match(shortDateRegex);
              if (shortMatch) return shortMatch[0];
              
              const timeText = text.match(/\d{1,2}:\d{2}/);
              if (timeText) return timeText[0];
            }
            
            if (window.location.href.includes('gnn.gamer.com.tw')) {
              const dateContainer = document.querySelector('.GN-lbox3');
              if (dateContainer) {
                const text = dateContainer.innerText;
                const dateRegex = /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}/;
                const match = text.match(dateRegex);
                if (match) return match[0];
              }
            }
            
            const bodyText = document.body.innerText;
            const fullDateRegex = /\d{4}[年\/\-\.\s]?\d{1,2}[월\/\-\.\s]?\d{1,2}[일]?/g;
            const allDates = bodyText.match(fullDateRegex);
            if (allDates && allDates.length > 0) {
              return allDates[0];
            }
            
            const shortDatesRegex = /\d{2}[-\.\/]\d{2}/g;
            const shortDates = bodyText.match(shortDatesRegex);
            if (shortDates && shortDates.length > 0) {
              return shortDates[0];
            }
            
            return '';
          });
        } catch (error) {
          console.error('날짜 추출 중 오류:', error.message);
        }
      }
      
      // 날짜 형식 정규화 (오늘 한국 시간 기준)
      try {
        const koreaTime = new Date().toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\./g, '-').replace(/\s/g, '').replace(/-$/, '');
        
        const currentYear = new Date().getFullYear();
        
        // MM 월 DD 일 형식 처리 (예: "05 월 18 일")
        if (date && /\d{1,2}\s*월\s*\d{1,2}\s*일/.test(date)) {
          const match = date.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
          if (match) {
            const month = match[1].padStart(2, '0');
            const day = match[2].padStart(2, '0');
            date = `${currentYear}-${month}-${day}`;
          }
        }
        
        // 중국어 날짜 표현을 변환
        if (date && (date.includes('年') || date.includes('月') || date.includes('日'))) {
          const fullMatch = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
          if (fullMatch) {
            const year = fullMatch[1];
            const month = fullMatch[2].padStart(2, '0');
            const day = fullMatch[3].padStart(2, '0');
            date = `${year}-${month}-${day}`;
          } else {
            const partialMatch = date.match(/(\d{1,2})月(\d{1,2})日/);
            if (partialMatch) {
              const month = partialMatch[1].padStart(2, '0');
              const day = partialMatch[2].padStart(2, '0');
              date = `${currentYear}-${month}-${day}`;
            }
          }
        }
        
        // 날짜가 숫자만 있는 경우 (예: 20240512)
        if (date && /^\d{8}$/.test(date)) {
          const year = date.substring(0, 4);
          const month = date.substring(4, 6);
          const day = date.substring(6, 8);
          date = `${year}-${month}-${day}`;
        }
        
        // MM-DD 형식 변환
        if (date && /^\d{1,2}[-\.\/]\d{1,2}$/.test(date)) {
          const separator = date.includes('-') ? '-' : date.includes('/') ? '/' : '.';
          const parts = date.split(separator);
          if (parts.length === 2) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            date = `${currentYear}-${month}-${day}`;
          }
        }
        
        console.log(`📅 추출된 날짜: ${date}`);
      } catch (error) {
        console.error('날짜 형식 정규화 중 오류:', error.message);
      }
            
      // 날짜가 없거나 유효하지 않은 경우 기본값 사용
      if (!date || !/\d{4}-\d{2}-\d{2}/.test(date)) {
        console.warn(`⚠️ 유효하지 않은 날짜 "${date}" → 어제로 fallback`);
        date = getYesterday();
      }
      
      // 날짜 필터링
      const isRecent = isTodayOrYesterday(date) || isWithin24HoursFromString(date);
      if (!isRecent) continue;

      // Youxituoluo 사이트는 날짜 형식이 이상한 경우 수정
      if (article.source === 'Youxituoluo') {
        // 날짜 형식이 이상한 경우 (1107-77-02 같은) 현재 시간 기준 24시간 내 기사로 간주
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.includes('1107')) {
          console.log(`ℹ️ [Youxituoluo] 날짜 형식 이상, 24시간 이내 기사로 처리: ${date}`);
          // 기사 처리 계속 진행
        } else if (!isGitHubActions) {
          // 명확한 날짜가 있는 경우 24시간 이내인지 확인 (로컬에서만)
          const articleDate = new Date(date);
          const now = new Date();
          const timeDiff = now - articleDate;
          const within24Hours = timeDiff <= 24 * 60 * 60 * 1000;
          
          if (!within24Hours) {
            console.log(`❌ [Youxituoluo] 24시간 이내 기사가 아니므로 건너뛰기: ${date}`);
            await page.close();
            continue;
          }
        }
      } else if (!isRecent && !isGitHubActions) {
        // 다른 사이트는 기존처럼 최근 기사 체크 (로컬에서만)
        console.log(`❌ 최근 기사가 아니므로 건너뛰기: ${date} (${article.date})`);
        await page.close();
        continue;
      }
      
      // 본문 내용 추출
      let content = '';
      
      for (const contentSelector of site.selectors.content) {
        try {
          const hasContent = await page.evaluate((selector) => {
            return document.querySelector(selector) !== null;
          }, contentSelector);
          
          if (hasContent) {
            content = await page.evaluate((selector) => {
              const contentElement = document.querySelector(selector);
              if (!contentElement) return '';
              
              const paragraphs = contentElement.querySelectorAll('p');
              if (paragraphs.length > 0) {
                return Array.from(paragraphs)
                  .map(p => p.innerText.trim())
                  .filter(text => text.length > 0)
                  .join('\n\n');
              }
              
              return contentElement.innerText.trim();
            }, contentSelector);
            
            if (content.length > 0) break;
          }
        } catch (error) {
          console.error(`❌ 콘텐츠 선택자 '${contentSelector}' 사용 중 오류:`, error.message);
        }
      }
      
      // 대체 방법: 전체 본문에서 가장 긴 텍스트 블록 찾기
      if (!content || content.length < 100) {
        content = await page.evaluate(() => {
          const containerSelectors = [
            'article', '.article', '.content', '.post', 'main', '#content', '#main',
            '.article-content', '.news-content', '.post-content', '.entry-content',
            '.detail-content', '.news-detail', '.article-detail'
          ];
          
          let longestText = '';
          
          for (const selector of containerSelectors) {
            const container = document.querySelector(selector);
            if (!container) continue;
            
            const paragraphs = container.querySelectorAll('p');
            if (paragraphs.length > 0) {
              const text = Array.from(paragraphs)
                .map(p => p.innerText.trim())
                .filter(text => text.length > 0)
                .join('\n\n');
              
              if (text.length > longestText.length) {
                longestText = text;
              }
            }
          }
          
          if (longestText.length < 100) {
            const allParagraphs = document.body.querySelectorAll('p');
            if (allParagraphs.length > 0) {
              const text = Array.from(allParagraphs)
                .map(p => p.innerText.trim())
                .filter(text => text.length > 0)
                .join('\n\n');
              
              if (text.length > longestText.length) {
                longestText = text;
              }
            }
          }
          
          if (longestText.length < 100) {
            const allDivs = document.body.querySelectorAll('div');
            const textDivs = Array.from(allDivs)
              .filter(div => {
                const text = div.innerText.trim();
                return text.length > 200 && div.children.length < 5;
              });
            
            if (textDivs.length > 0) {
              const longestDiv = textDivs.reduce((longest, current) => {
                return current.innerText.length > longest.innerText.length ? current : longest;
              }, textDivs[0]);
              
              if (longestDiv && longestDiv.innerText.length > longestText.length) {
                longestText = longestDiv.innerText.trim();
              }
            }
          }
          
          return longestText;
        });
      }
      
      // 이미지 URL 추출 (GitHub Actions 환경에서 더 안전하게)
      let imageUrl = '';
      try {
        imageUrl = await page.evaluate(() => {
          // Open Graph 이미지 우선 확인
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage) {
            const ogSrc = ogImage.getAttribute('content');
            if (ogSrc && !ogSrc.includes('logo') && !ogSrc.includes('default') && !ogSrc.includes('avatar')) {
              return ogSrc;
            }
          }

          // 본문 내 첫 번째 이미지
          const contentSelectors = [
            '.article-content img', '.news-content img', '.content img', '.post-content img'
          ];
          
          for (const selector of contentSelectors) {
            const img = document.querySelector(selector);
            if (img) {
              const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
              if (src && !src.includes('logo') && !src.includes('wx_code') && !src.includes('avatar')) {
                return src;
              }
            }
          }
          
          // 첫 번째 이미지 (로고가 아닌 경우)
          const allImages = Array.from(document.querySelectorAll('img'));
          for (const img of allImages) {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
            if (src && !src.includes('logo') && !src.includes('wx_code') && !src.includes('avatar')) {
              return src;
            }
          }
          
          return '';
        });
      } catch (error) {
        console.error('이미지 추출 중 오류:', error.message);
        imageUrl = '';
      }
      
      // 기사 요약 생성
      let summary = '';
      if (content && content.length > 100) {
        summary = content.substring(0, 200).trim();
        if (summary.length === 200) {
          const lastPeriodIndex = summary.lastIndexOf('。');
          if (lastPeriodIndex > 100) {
            summary = summary.substring(0, lastPeriodIndex + 1);
          } else {
            const lastSpaceIndex = summary.lastIndexOf(' ');
            if (lastSpaceIndex > 100) {
              summary = summary.substring(0, lastSpaceIndex);
            }
          }
        }
        summary += '...';
      }
      
      // 결과 저장
      detailedArticles.push({
        title: article.title,
        url: article.url,
        date: date,
        summary: summary,
        content: content || '본문을 추출할 수 없습니다.',
        image: imageUrl || '',
        source: article.source,
        region: article.region
      });
      
      await page.close();
      
      // 간격을 두고 요청 (차단 방지)
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (error) {
      console.error(`❌ 기사 상세 내용 크롤링 실패: ${article.url}`, error.message);
      
      // 오류가 발생해도 기본 정보 저장
      detailedArticles.push({
        title: article.title,
        url: article.url,
        date: article.date || getYesterday(),
        content: '크롤링 중 오류 발생: ' + error.message,
        source: article.source,
        region: article.region,
        error: true
      });
    }
  }
  
  return detailedArticles;
}

// 웹훅 전송 함수 (GitHub Actions 환경 고려)
async function sendWebhook(results) {
  try {
    const webhookUrl = process.env.WEBHOOK_URL || 'https://hook.eu2.make.com/c12mntjqlejllxuy542usubxqgggcwyj';

    const agent = new https.Agent({
      rejectUnauthorized: false
    });

    const response = await axios.post(
      webhookUrl,
      { articles: results },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        httpsAgent: agent,
        timeout: 30000
      }
    );

    console.log('🚀 웹훅 전송 성공:', response.status);
    return true;
  } catch (e) {
    console.error('❌ 웹훅 전송 실패:', e.message);
    return false;
  }
}

// 메인 함수 (GitHub Actions 환경 최적화)
async function runUnifiedCrawler() {
  console.log('🚀 통합 중국/대만 게임 뉴스 크롤러 시작');
  
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  if (isGitHubActions) {
    console.log('🤖 GitHub Actions 환경에서 실행 중');
  }
  
  console.log(`📅 최근 기사를 수집합니다:`);
  console.log(`   - RSS: 24시간 이내`);
  console.log(`   - 웹페이지: 최근 기사`);
  
  let allResults = [];
  
  // Puppeteer 브라우저 시작 (GitHub Actions용 설정)
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--window-size=1920,1080',
      '--single-process', // GitHub Actions에서 메모리 절약
      '--no-zygote'
    ]
  });
  
  try {
    // 1. RSS 크롤링 실행 (RSS에서 직접 전체 본문 추출)
    console.log('\n📡 RSS 크롤링 시작...');
    const rssResults = await crawlRSS();
    allResults = [...allResults, ...rssResults];
    
    // 2. 웹페이지 크롤링 실행
    console.log('\n🌐 웹페이지 크롤링 시작...');
    const webResults = await crawlWebsites(browser);
    allResults = [...allResults, ...webResults];
    
  } catch (error) {
    console.error('❌ 크롤링 중 오류 발생:', error.message);
  } finally {
    await browser.close();
    console.log('👋 브라우저 종료됨');
  }
  
  // 3. 결과 처리
  console.log(`\n📊 통합 크롤링 결과`);
  console.log(`📊 총 수집된 기사 수: ${allResults.length}`);
  
  // RSS와 웹페이지별 통계
  const rssCount = allResults.filter(article => article.source === 'GameLook').length;
  const webCount = allResults.length - rssCount;
  console.log(`📊 RSS 크롤링: ${rssCount}건`);
  console.log(`📊 웹페이지 크롤링: ${webCount}건`);
  
  // 지역별 통계
  const chinaCount = allResults.filter(article => article.region === '중국').length;
  const taiwanCount = allResults.filter(article => article.region === '대만').length;
  console.log(`📊 중국 기사: ${chinaCount}건`);
  console.log(`📊 대만 기사: ${taiwanCount}건`);
  
  // 소스별 통계
  const sourceStats = {};
  allResults.forEach(article => {
    sourceStats[article.source] = (sourceStats[article.source] || 0) + 1;
  });
  console.log(`📊 소스별 통계:`, sourceStats);
  
  // 결과가 없을 경우 샘플 데이터 생성
  if (allResults.length === 0) {
    console.log('⚠️ 수집된 기사가 없습니다. 샘플 데이터를 생성합니다.');
    
    const yesterday = getYesterday();
    
    allResults.push({
      title: "샘플 데이터 - 수집된 기사 없음",
      url: "https://example.com",
      date: yesterday,
      summary: "수집된 크롤링 결과가 없어 생성된 샘플 데이터입니다.",
      content: "수집된 크롤링 결과가 없어 생성된 샘플 데이터입니다.",
      image: "",
      source: "Sample",
      region: "샘플",
      error: "수집된 기사 없음"
    });
  }
  
  // 4. 결과를 JSON 파일로 저장
  const dateStr = getCurrentDate();
  const fileName = `test_game_news_crawled_on_${dateStr}.json`;
  
  try {
    fs.writeFileSync(fileName, JSON.stringify(allResults, null, 2), 'utf8');
    console.log(`📁 JSON 파일 생성 완료: ${fileName}`);
  } catch (error) {
    console.error('❌ JSON 파일 저장 실패:', error.message);
  }
  
  // 5. 웹훅 전송
  console.log('\n🚀 웹훅 전송 시도...');
  const webhookSuccess = await sendWebhook(allResults);
  
  if (webhookSuccess) {
    console.log('✅ 웹훅 전송 성공!');
  } else {
    console.log('❌ 웹훅 전송 실패');
  }
  
  console.log('\n✅ 통합 크롤러 실행 완료!');
  
  // GitHub Actions 환경에서 프로세스 종료 코드 설정
  if (isGitHubActions) {
    process.exit(webhookSuccess ? 0 : 1);
  }
}

// 크롤러 실행
runUnifiedCrawler().catch(err => {
  console.error('❌ 통합 크롤러 실행 중 치명적 오류 발생:', err);
  
  // 오류가 발생해도 결과 파일 생성
  const dateStr = getCurrentDate();
  const errorResult = [{
    title: '크롤링 중 오류 발생',
    url: 'https://example.com/error',
    date: getYesterday(),
    summary: '크롤링 중 치명적 오류 발생: ' + err.message,
    content: '크롤링 중 치명적 오류 발생: ' + err.message,
    image: '',
    source: 'Error',
    region: 'Error',
    error: true
  }];
  
  try {
    fs.writeFileSync(
      `test_game_news_crawled_on_${dateStr}.json`,
      JSON.stringify(errorResult, null, 2),
      'utf8'
    );
    console.log('📁 오류 결과 파일 생성 완료');
  } catch (writeError) {
    console.error('❌ 오류 결과 파일 저장 실패:', writeError.message);
  }
  
  // 웹훅으로 오류 정보 전송 시도
  sendWebhook(errorResult).then((success) => {
    if (success) {
      console.log('🚀 오류 정보 웹훅 전송 성공');
    } else {
      console.log('❌ 오류 정보 웹훅 전송 실패');
    }
    
    process.exit(1);
  }).catch(() => {
    process.exit(1);
  });
});
