
import { db, domains } from '../lib/db';


const FULL_BUCKETS = [
    {
        name: 'LEGAL',
        niche: 'Legal',
        theme: 'navy-serif',
        cloudflare: 'legal-content-1@[email]',
        domains: [
            // Tier 1: Lead Gen Only (All Bucket 1 as per user)
            { domain: 'personalinjuryguide.org', type: 'Hub', monetization: 'Lead gen Attorney leads', revenue: '$2,000-8,000', tier: 1 },
            { domain: 'personalinjuryguide.app', type: 'Tool', monetization: 'Lead gen Attorney leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'caraccidentclaim.org', type: 'Niche', monetization: 'Lead gen Attorney leads', revenue: '$1,500-5,000', tier: 1 },
            { domain: 'caraccidentclaim.app', type: 'Tool', monetization: 'Lead gen Attorney leads', revenue: '$500-1,500', tier: 1 },
            { domain: 'mesotheliomaguide.org', type: 'Niche', monetization: 'Lead gen Attorney leads', revenue: '$2,000-10,000', tier: 1 },
            { domain: 'mesotheliomaguide.app', type: 'Tool', monetization: 'Lead gen Attorney leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'doihaveacase.org', type: 'Decision', monetization: 'Lead gen Attorney leads', revenue: '$1,000-4,000', tier: 1 },
            { domain: 'mycaseworth.org', type: 'Tool', monetization: 'Lead gen Attorney leads', revenue: '$1,000-3,000', tier: 1 },
            { domain: 'myinjuryclaim.org', type: 'Niche', monetization: 'Lead gen Attorney leads', revenue: '$800-3,000', tier: 1 },
            { domain: 'claimsettlement.org', type: 'Info', monetization: 'Lead gen + affiliates', revenue: '$500-2,000', tier: 1 },
            { domain: 'workerscompguide.org', type: 'Niche', monetization: 'Lead gen Attorney leads', revenue: '$1,000-4,000', tier: 1 },
            { domain: 'needalawyer.app', type: 'Tool', monetization: 'Lead gen Attorney leads', revenue: '$1,000-5,000', tier: 1 },
            { domain: 'duilawyer.guide', type: 'Niche', monetization: 'Lead gen DUI attorney leads', revenue: '$800-3,000', tier: 1 },
            { domain: 'suitorsettle.com', type: 'Decision', monetization: 'Lead gen Attorney leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'evictionrights.org', type: 'Info', monetization: 'Lead gen + display', revenue: '$300-1,200', tier: 1 },
            { domain: 'howtofileaclaim.org', type: 'Info', monetization: 'Lead gen Mixed legal leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'filemydisability.org', type: 'Niche', monetization: 'Lead gen Disability attorney leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'isthislegal.org', type: 'Broad', monetization: 'Display + lead gen', revenue: '$300-1,500', tier: 1 },
        ]
    },
    {
        name: 'INSURANCE',
        niche: 'Insurance',
        theme: 'green-modern',
        cloudflare: 'insurance-content-1@[email]',
        domains: [
            // Tier 1: Lead Gen Only (All Bucket 2 as per user)
            { domain: 'comparemyinsurance.org', type: 'Hub', monetization: 'Lead gen Insurance leads', revenue: '$1,500-5,000', tier: 1 },
            { domain: 'comparemyinsurance.app', type: 'Tool', monetization: 'Lead gen', revenue: '$800-3,000', tier: 1 },
            { domain: 'switchinsurance.app', type: 'Tool', monetization: 'Lead gen', revenue: '$500-2,000', tier: 1 },
            { domain: 'switchmyinsurance.org', type: 'Niche', monetization: 'Lead gen', revenue: '$500-2,000', tier: 1 },
            { domain: 'cheaperinsurance.app', type: 'Tool', monetization: 'Lead gen', revenue: '$500-2,000', tier: 1 },
            { domain: 'lowercarinsurance.org', type: 'Niche', monetization: 'Lead gen Auto insurance leads', revenue: '$1,000-4,000', tier: 1 },
            { domain: 'lowercarinsurance.app', type: 'Tool', monetization: 'Lead gen Auto quote leads', revenue: '$500-2,000', tier: 1 },
            { domain: 'isinsuranceworthit.com', type: 'Decision', monetization: 'Display + affiliate', revenue: '$300-1,200', tier: 1 }, // Sticking to user rule "All bucket 2"
            { domain: 'insurancescam.org', type: 'Info', monetization: 'Display + lead gen', revenue: '$200-800', tier: 1 },
        ]
    },
    {
        name: 'HEALTH',
        niche: 'Health',
        theme: 'medical-clean',
        cloudflare: 'health-content-1@[email]',
        domains: [
            // Specific Tiers based on request
            { domain: 'ozempicvsmounjaro.com', type: 'Comparison', monetization: 'Affiliate Telehealth', revenue: '$2,000-8,000', tier: 2 },
            { domain: 'supplementorscam.com', type: 'Decision', monetization: 'Affiliate Supplement', revenue: '$500-2,500', tier: 2 },
            { domain: 'therapyornot.com', type: 'Decision', monetization: 'Affiliate BetterHelp', revenue: '$500-3,000', tier: 2 },

            // Info -> Tier 3
            { domain: 'sideeffectsof.com', type: 'Info Hub', monetization: 'Display Mediavine', revenue: '$1,000-5,000', tier: 3 },
            { domain: 'toomuchcaffeine.com', type: 'Info', monetization: 'Display', revenue: '$200-1,000', tier: 3 },
            { domain: 'symptomcheck.health', type: 'Tool', monetization: 'Display High traffic', revenue: '$500-2,000', tier: 3 },

            // Rest defaulting to Tier 2 or 3 appropriately
            { domain: 'findtreatment.health', type: 'Lead gen', monetization: 'Affiliate Treatment center', revenue: '$500-3,000', tier: 2 },
            { domain: 'druginteraction.health', type: 'Tool', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'creatinesafe.org', type: 'Info', monetization: 'Affiliate Supplement', revenue: '$200-800', tier: 3 },
            { domain: 'cortisolguide.org', type: 'Info', monetization: 'Affiliate Supplement + telehealth', revenue: '$200-1,000', tier: 3 },
            { domain: 'testosteroneguide.org', type: 'Info', monetization: 'Affiliate TRT clinic', revenue: '$500-3,000', tier: 2 },
            { domain: 'magnesiumguide.org', type: 'Info', monetization: 'Affiliate Supplement', revenue: '$200-800', tier: 3 },
            { domain: 'isitsafetotake.org', type: 'Broad', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'allergycheck.health', type: 'Tool', monetization: 'Display + affiliate', revenue: '$200-1,000', tier: 3 },
            { domain: 'hormoncheck.health', type: 'Tool', monetization: 'Affiliate TRT', revenue: '$300-1,500', tier: 2 },
            { domain: 'dosagecheck.health', type: 'Tool', monetization: 'Display', revenue: '$200-800', tier: 3 },
            { domain: 'fastingguide.health', type: 'Info', monetization: 'Affiliate App', revenue: '$200-1,000', tier: 2 },
            { domain: 'supplementcheck.health', type: 'Tool', monetization: 'Affiliate Supplement', revenue: '$200-1,000', tier: 2 },
            { domain: 'gutreset.health', type: 'Info', monetization: 'Affiliate Supplement', revenue: '$200-1,000', tier: 2 },
            { domain: 'vitaminsdontwork.com', type: 'Contrarian', monetization: 'Display + affiliate', revenue: '$300-1,200', tier: 3 },

            { domain: 'costoftherapy.com', type: 'Cost guide', monetization: 'Affiliate Therapy', revenue: '$300-1,500', tier: 2 },
            { domain: 'costoftherapy.org', type: 'Cost guide', monetization: 'Affiliate Therapy', revenue: '$200-800', tier: 2 },
            { domain: 'secondopinionguide.com', type: 'Info', monetization: 'Affiliate Telehealth', revenue: '$200-800', tier: 2 },
            { domain: 'genericvsbrand.com', type: 'Comparison', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'overthecounterguide.com', type: 'Info', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'namebrandvsgeneric.com', type: 'Comparison', monetization: 'Display + affiliate', revenue: '$300-1,200', tier: 3 },
        ]
    },
    {
        name: 'FINANCE',
        niche: 'Finance',
        theme: 'minimal-blue',
        cloudflare: 'finance-content-1@[email]',
        domains: [
            // Tier 2: Comparisons
            { domain: '401korira.com', type: 'Comparison', monetization: 'Affiliate Brokerage', revenue: '$500-2,500', tier: 2 },
            { domain: 'rothorreg.com', type: 'Comparison', monetization: 'Affiliate Brokerage', revenue: '$500-2,000', tier: 2 },
            { domain: 'creditcardpayoff.com', type: 'Tool', monetization: 'Affiliate Balance transfer', revenue: '$500-2,500', tier: 2 },

            // Tier 3: Tools/Info
            { domain: 'grosstonet.org', type: 'Tool', monetization: 'Display Calculator', revenue: '$100-500', tier: 3 },
            { domain: 'salarytohourly.org', type: 'Tool', monetization: 'Display Calculator', revenue: '$200-800', tier: 3 },

            // Others
            { domain: 'creditrepairguide.co', type: 'Hub', monetization: 'Lead gen Credit repair', revenue: '$800-3,000', tier: 1 }, // Lead gen usually T1
            { domain: 'consolidatemydebt.com', type: 'Lead gen', monetization: 'Lead gen Debt consolidation', revenue: '$1,000-4,000', tier: 1 },

            { domain: 'creditcardpayoff.org', type: 'Tool', monetization: 'Affiliate Balance transfer', revenue: '$300-1,200', tier: 2 },
            { domain: 'studentloanpayoff.org', type: 'Tool', monetization: 'Affiliate Refinance', revenue: '$300-1,500', tier: 2 },
            { domain: 'studentloanforgive.org', type: 'Info', monetization: 'Display + affiliate', revenue: '$500-2,000', tier: 3 },
            { domain: 'debtfreeguide.org', type: 'Hub', monetization: 'Affiliate Debt tools', revenue: '$500-2,000', tier: 2 },
            { domain: 'debtfreeguide.app', type: 'Tool', monetization: 'Affiliate Debt payoff', revenue: '$300-1,200', tier: 2 },
            { domain: 'bankruptcyornot.org', type: 'Decision', monetization: 'Lead gen Bankruptcy attorney', revenue: '$500-2,500', tier: 1 },
            { domain: 'bankruptcyornot.app', type: 'Tool', monetization: 'Lead gen Attorney', revenue: '$300-1,200', tier: 1 },
            { domain: 'ssiguide.org', type: 'Info', monetization: 'Display + affiliate', revenue: '$300-1,000', tier: 3 },
            { domain: 'disabilitypay.org', type: 'Info', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'disabilityclaimguide.org', type: 'Hub', monetization: 'Lead gen Disability', revenue: '$500-2,000', tier: 1 },
            { domain: 'taxreliefguide.org', type: 'Niche', monetization: 'Lead gen Tax resolution', revenue: '$500-2,500', tier: 1 },
            { domain: 'taxreliefguide.app', type: 'Tool', monetization: 'Lead gen Tax resolution', revenue: '$300-1,200', tier: 1 },
            { domain: '1099guide.org', type: 'Info', monetization: 'Affiliate Tax software', revenue: '$200-1,000', tier: 2 },
            { domain: 'writeoffguide.com', type: 'Info', monetization: 'Affiliate Tax software', revenue: '$300-1,500', tier: 2 },
            { domain: 'findmydeduction.com', type: 'Tool', monetization: 'Affiliate Tax software', revenue: '$300-1,500', tier: 2 },
            { domain: 'whatdoiowe.org', type: 'Tool', monetization: 'Display + lead gen', revenue: '$200-1,000', tier: 3 },
            { domain: 'payofforsave.com', type: 'Decision', monetization: 'Affiliate Brokerage', revenue: '$200-1,000', tier: 2 },
            { domain: 'buildwealth.money', type: 'Info', monetization: 'Affiliate Brokerage', revenue: '$200-1,000', tier: 2 },
            { domain: 'earnmore.money', type: 'Info', monetization: 'Affiliate Side hustle', revenue: '$200-800', tier: 2 },
            { domain: 'investsmart.money', type: 'Info', monetization: 'Affiliate Brokerage', revenue: '$200-1,000', tier: 2 },
            { domain: 'growwealth.money', type: 'Info', monetization: 'Affiliate Brokerage', revenue: '$200-800', tier: 2 },
            { domain: 'payyourself.money', type: 'Info', monetization: 'Affiliate Savings', revenue: '$100-500', tier: 2 },
            { domain: 'debtfree.money', type: 'Info', monetization: 'Affiliate Debt tools', revenue: '$200-800', tier: 2 },
            { domain: 'begininvesting.org', type: 'Info', monetization: 'Affiliate Brokerage', revenue: '$300-1,500', tier: 2 },
            { domain: 'hiddenfee.org', type: 'Consumer', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'indexfundpick.com', type: 'Info', monetization: 'Affiliate Brokerage', revenue: '$200-1,000', tier: 2 },
            { domain: 'bogleheadguide.com', type: 'Info', monetization: 'Affiliate Vanguard', revenue: '$300-1,500', tier: 2 },
            { domain: 'washsalerule.com', type: 'Info', monetization: 'Affiliate Tax software', revenue: '$100-500', tier: 2 },
            { domain: 'equityvssalary.com', type: 'Comparison', monetization: 'Display Tech', revenue: '$100-500', tier: 3 },
            { domain: 'monthlybillcheck.com', type: 'Tool', monetization: 'Affiliate Bill negotiation', revenue: '$200-1,000', tier: 2 },
        ]
    },
    {
        name: 'REAL_ESTATE',
        niche: 'Real Estate',
        theme: 'earth-inviting',
        cloudflare: 'realestate-content-1@[email]',
        domains: [
            // Tier 1: Lead Gen
            { domain: 'comparemortgage.app', type: 'Tool', monetization: 'Lead gen Mortgage', revenue: '$800-3,000', tier: 1 },
            { domain: 'refinancemyloan.org', type: 'Lead gen', monetization: 'Lead gen Refi', revenue: '$500-2,500', tier: 1 },
            { domain: 'myhomevalue.io', type: 'Tool', monetization: 'Lead gen Realtor', revenue: '$1,000-5,000', tier: 1 },

            // Tier 2: Decision
            { domain: 'isrentingwaste.com', type: 'Decision', monetization: 'Affiliate + lead gen', revenue: '$500-2,000', tier: 2 },
            { domain: 'armvsfixed.com', type: 'Comparison', monetization: 'Lead gen Mortgage', revenue: '$300-1,500', tier: 2 },

            // Others
            { domain: 'shouldirefinance.org', type: 'Decision', monetization: 'Lead gen Refi', revenue: '$500-2,000', tier: 1 }, // Lead gen
            { domain: 'pointsornopoints.com', type: 'Decision', monetization: 'Lead gen Mortgage', revenue: '$200-1,000', tier: 1 }, // Lead gen
            { domain: 'whatsmyhomeworth.money', type: 'Tool', monetization: 'Lead gen Realtor', revenue: '$300-1,200', tier: 1 },
            { domain: 'whatsmyequity.com', type: 'Tool', monetization: 'Lead gen HELOC', revenue: '$300-1,500', tier: 1 },
            { domain: 'homeinspectionguide.org', type: 'Info', monetization: 'Affiliate Home warranty', revenue: '$200-1,000', tier: 2 },
            { domain: 'reversemortgageguide.org', type: 'Info', monetization: 'Lead gen Reverse mortgage', revenue: '$500-2,500', tier: 1 },
            { domain: 'rentvsown.org', type: 'Comparison', monetization: 'Lead gen Mortgage', revenue: '$300-1,500', tier: 2 },
            { domain: 'refinancetiming.com', type: 'Info', monetization: 'Lead gen Refi', revenue: '$300-1,200', tier: 1 },
            { domain: 'foreclosureguide.com', type: 'Info', monetization: 'Lead gen Attorney', revenue: '$300-1,500', tier: 1 },
            { domain: 'lowermyrent.org', type: 'Info', monetization: 'Display + affiliate', revenue: '$100-500', tier: 3 },
        ]
    },
    {
        name: 'MEDICARE',
        niche: 'Medicare',
        theme: 'high-contrast-accessible',
        cloudflare: 'medicare-content-1@[email]',
        domains: [
            // Tier 1: All Bucket 6
            { domain: 'medicarevsadvantage.com', type: 'Comparison', monetization: 'Lead gen Medicare', revenue: '$1,500-6,000', tier: 1 },
            { domain: 'medicarevsadvantage.app', type: 'Tool', monetization: 'Lead gen Medicare', revenue: '$500-2,000', tier: 1 },
            { domain: 'medicarepicker.org', type: 'Hub', monetization: 'Lead gen Medicare', revenue: '$800-3,000', tier: 1 },
            { domain: 'medicarepicker.app', type: 'Tool', monetization: 'Lead gen Medicare', revenue: '$500-2,000', tier: 1 },
            { domain: 'medicarechoices.app', type: 'Tool', monetization: 'Lead gen Medicare', revenue: '$500-2,000', tier: 1 },
            { domain: 'medicaresignup.com', type: 'Lead gen', monetization: 'Lead gen Medicare', revenue: '$1,000-5,000', tier: 1 },
            { domain: 'openseasonchoices.com', type: 'Niche', monetization: 'Lead gen FEHB', revenue: '$500-2,000', tier: 1 },
            { domain: 'openseasonchoices.org', type: 'Niche', monetization: 'Lead gen FEHB', revenue: '$300-1,200', tier: 1 },
            { domain: 'besethealthplan.com', type: 'Comparison', monetization: 'Lead gen Health insurance', revenue: '$500-2,000', tier: 1 },
            { domain: 'besethealthplan.org', type: 'Niche', monetization: 'Lead gen Health insurance', revenue: '$300-1,200', tier: 1 },
        ]
    },
    {
        name: 'CONSUMER',
        niche: 'Consumer',
        theme: 'playful-modern',
        cloudflare: 'consumer-content-1@[email]',
        domains: [
            // Tier 3: Broad Info / Display
            { domain: 'truecostof.com', type: 'Cost Hub', monetization: 'Display + affiliate', revenue: '$500-3,000', tier: 3 },
            { domain: 'doesitactuallywork.org', type: 'Review Hub', monetization: 'Display + affiliate', revenue: '$500-2,500', tier: 3 },
            { domain: 'isthisworth.com', type: 'Decision Hub', monetization: 'Display + affiliate', revenue: '$500-3,000', tier: 3 },
            { domain: 'versusthis.com', type: 'Comparison Hub', monetization: 'Display + affiliate', revenue: '$500-2,500', tier: 4 }, // Mark as Brand/Hold
            { domain: 'amibeingscammed.co', type: 'Consumer', monetization: 'Display', revenue: '$200-1,000', tier: 3 },
            { domain: 'scamornot.com', type: 'Review', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'hiddenfeewatch.org', type: 'Consumer', monetization: 'Display', revenue: '$100-500', tier: 3 },
            { domain: 'costperuse.org', type: 'Tool', monetization: 'Display Calculator', revenue: '$100-500', tier: 3 },

            // Tier 4: Brand
            { domain: 'fixmylife.co', type: 'Broad', monetization: 'Display + affiliate', revenue: '$200-800', tier: 4 }, // Brand Potential

            // Others
            { domain: 'shouldicancel.com', type: 'Decision Hub', monetization: 'Affiliate Subscription', revenue: '$500-3,000', tier: 2 },
            { domain: 'shouldicancel.org', type: 'Decision', monetization: 'Affiliate Subscription', revenue: '$200-1,000', tier: 2 },
            { domain: 'amigettingscammed.co', type: 'Consumer', monetization: 'Display', revenue: '$200-800', tier: 3 },
            { domain: 'affordcheck.com', type: 'Tool', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'fixitorbuyit.com', type: 'Decision', monetization: 'Display + affiliate', revenue: '$200-1,000', tier: 3 },
            { domain: 'fixorjunk.com', type: 'Decision', monetization: 'Affiliate Junk car', revenue: '$200-1,000', tier: 2 },
            { domain: 'repairworth.com', type: 'Decision', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'repairvsreplace.org', type: 'Decision', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'warrantyworth.com', type: 'Decision', monetization: 'Affiliate Warranty', revenue: '$200-1,000', tier: 2 },
            { domain: 'warrantyornot.com', type: 'Decision', monetization: 'Affiliate Extended warranty', revenue: '$200-800', tier: 2 },
            { domain: 'extendedwarrantyguide.com', type: 'Info', monetization: 'Affiliate Warranty', revenue: '$200-1,000', tier: 2 },
            { domain: 'refurbishedornew.com', type: 'Comparison', monetization: 'Affiliate Refurb', revenue: '$200-800', tier: 2 },
            { domain: 'pricevsquality.com', type: 'Comparison', monetization: 'Display + affiliate', revenue: '$200-1,000', tier: 3 },
            { domain: 'bestbangforbuck.com', type: 'Review', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'canireturnthis.com', type: 'Info', monetization: 'Display', revenue: '$200-800', tier: 3 },
            { domain: 'whatcaniclaim.com', type: 'Info', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'lemoncheck.co', type: 'Tool', monetization: 'Affiliate Vehicle history', revenue: '$200-1,000', tier: 2 },
            { domain: 'dealerscam.com', type: 'Consumer', monetization: 'Display + affiliate', revenue: '$200-1,000', tier: 3 },
            { domain: 'contractorscam.org', type: 'Consumer', monetization: 'Display Local', revenue: '$100-500', tier: 3 },
            { domain: 'consumertrap.org', type: 'Consumer', monetization: 'Display', revenue: '$100-500', tier: 3 },
            { domain: 'overchargedalert.org', type: 'Consumer', monetization: 'Display', revenue: '$100-500', tier: 3 },
            { domain: 'pricefairness.org', type: 'Consumer', monetization: 'Display', revenue: '$100-500', tier: 3 },
            { domain: 'shouldiquit.net', type: 'Decision', monetization: 'Display + affiliate', revenue: '$200-1,000', tier: 3 },
        ]
    },
    {
        name: 'AUTO',
        niche: 'Automotive',
        theme: 'masculine-dark',
        cloudflare: 'auto-content-1@[email]',
        domains: [
            // Tier 2: Auto
            { domain: 'suvvssedan.com', type: 'Comparison', monetization: 'Affiliate Auto', revenue: '$300-1,500', tier: 2 },
            { domain: 'tradeinworth.com', type: 'Tool', monetization: 'Lead gen Dealer', revenue: '$500-2,000', tier: 2 }, // Actually Lead gen is Tier 1, but user listed in Tier 2

            // Others
            { domain: 'truckvssuv.com', type: 'Comparison', monetization: 'Affiliate Auto', revenue: '$300-1,500', tier: 2 },
            { domain: 'shoulditradein.com', type: 'Decision', monetization: 'Lead gen Dealer', revenue: '$300-1,500', tier: 1 }, // Lead gen usually T1
            { domain: 'junkcarworth.com', type: 'Tool', monetization: 'Lead gen Junk car', revenue: '$300-1,200', tier: 1 },
            { domain: 'totallossvalue.org', type: 'Tool', monetization: 'Lead gen Insurance', revenue: '$300-1,500', tier: 1 },
            { domain: 'totallossornot.com', type: 'Decision', monetization: 'Lead gen Insurance', revenue: '$200-1,000', tier: 1 },
            { domain: 'highmileageworth.com', type: 'Tool', monetization: 'Affiliate Vehicle', revenue: '$200-800', tier: 2 },
            { domain: 'usedcarworth.org', type: 'Tool', monetization: 'Affiliate KBB', revenue: '$200-1,000', tier: 2 },
            { domain: 'tradeinmistakes.com', type: 'Info', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
        ]
    },
    {
        name: 'COLLECTIBLES',
        niche: 'Collectibles',
        theme: 'enthusiast-community',
        cloudflare: 'niche-content-1@[email]',
        domains: [
            // Tier 2 likely
            { domain: 'pokemonappraisal.com', type: 'Tool', monetization: 'Affiliate TCGPlayer', revenue: '$300-1,500', tier: 2 },
            { domain: 'cardgradingguide.com', type: 'Hub', monetization: 'Affiliate Grading', revenue: '$500-2,000', tier: 2 },
            { domain: 'sneakervaluation.com', type: 'Tool', monetization: 'Affiliate StockX', revenue: '$300-1,500', tier: 2 },
        ]
    },
    {
        name: 'MISC',
        niche: 'Misc High Value',
        theme: 'clean-general',
        cloudflare: 'misc-content-1@[email]',
        domains: [
            // Tier 4: Brand
            { domain: 'richordead.org', type: 'Brand', monetization: 'Display', revenue: '$100-500', tier: 4 },

            // Others
            { domain: 'costofdivorce.com', type: 'Cost guide', monetization: 'Lead gen Divorce', revenue: '$1,000-5,000', tier: 1 },
            { domain: 'costofdivorce.org', type: 'Cost guide', monetization: 'Lead gen Divorce', revenue: '$500-2,000', tier: 1 },
            { domain: 'costofkids.com', type: 'Cost guide', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'costofkids.org', type: 'Cost guide', monetization: 'Display + affiliate', revenue: '$200-800', tier: 3 },
            { domain: 'costofivf.org', type: 'Cost guide', monetization: 'Lead gen Fertility', revenue: '$500-3,000', tier: 1 },
            { domain: 'alimonyguide.org', type: 'Info', monetization: 'Lead gen Family', revenue: '$300-1,500', tier: 1 },
            { domain: 'childsupportcalc.org', type: 'Tool', monetization: 'Lead gen Family', revenue: '$500-2,000', tier: 1 },
            { domain: 'prenupornot.com', type: 'Decision', monetization: 'Lead gen Family', revenue: '$300-1,500', tier: 1 },
            { domain: 'cancelmysubscription.org', type: 'Info', monetization: 'Affiliate Subscription', revenue: '$200-1,000', tier: 2 },
            { domain: 'besttaxstate.com', type: 'Info', monetization: 'Affiliate Moving', revenue: '$200-1,000', tier: 2 },
            { domain: 'besttaxstate.org', type: 'Info', monetization: 'Affiliate Moving', revenue: '$100-500', tier: 2 },
            { domain: 'tradeschoolvscollege.com', type: 'Comparison', monetization: 'Affiliate Education', revenue: '$300-1,500', tier: 2 },
            { domain: 'joborsidehustle.com', type: 'Decision', monetization: 'Affiliate Course', revenue: '$200-1,000', tier: 2 },
            { domain: 'costoflivingcompare.com', type: 'Tool', monetization: 'Display + affiliate', revenue: '$300-1,500', tier: 3 },
            { domain: 'llcformation.org', type: 'Info', monetization: 'Affiliate LegalZoom', revenue: '$500-2,500', tier: 2 },
            { domain: 'negotiateyourbill.com', type: 'Info', monetization: 'Affiliate Bill negotiation', revenue: '$200-1,000', tier: 2 },
            { domain: 'survivorbenefits.org', type: 'Info', monetization: 'Display', revenue: '$100-500', tier: 3 },
            { domain: 'safetotake.org', type: 'Info', monetization: 'Display + affiliate', revenue: '$100-500', tier: 3 },
            { domain: 'borrowerrights.org', type: 'Consumer', monetization: 'Display + lead gen', revenue: '$100-500', tier: 3 },
            { domain: 'creditadvocate.org', type: 'Consumer', monetization: 'Lead gen Credit', revenue: '$200-1,000', tier: 1 },
            { domain: 'debtadvocate.org', type: 'Consumer', monetization: 'Lead gen Debt', revenue: '$200-1,000', tier: 1 },
            { domain: 'tenantguide.org', type: 'Info', monetization: 'Display + lead gen', revenue: '$200-800', tier: 3 },
        ]
    }
];

// Helper to map user 'Type' to schema 'site_template' enum
function mapTemplate(type: string): string {
    const t = type.toLowerCase();
    if (t.includes('hub')) return 'hub';
    if (t.includes('tool')) return 'tool';
    if (t.includes('comparison')) return 'comparison';
    if (t.includes('decision')) return 'decision';
    if (t.includes('cost')) return 'cost_guide';
    if (t.includes('niche')) return 'niche';
    if (t.includes('info')) return 'info';
    if (t.includes('consumer')) return 'consumer';
    if (t.includes('review')) return 'review';
    if (t.includes('brand')) return 'brand';
    return 'authority';
}

async function seedBuckets() {
    console.log('[Seed] Starting bucket updates...');

    for (const bucket of FULL_BUCKETS) {
        console.log(`[Seed] Processing bucket: ${bucket.name} with ${bucket.domains.length} domains...`);

        for (const dom of bucket.domains) {
            // Extract TLD
            const parts = dom.domain.split('.');
            const tld = parts.at(-1) || 'com';

            const template = mapTemplate(dom.type);

            // Parse revenue range
            let revLow = 0;
            let revHigh = 0;
            if (dom.revenue) {
                const clean = dom.revenue.replaceAll(/[$,]/g, '');
                const range = clean.split('-');
                if (range.length === 2) {
                    revLow = Number.parseInt(range[0]) || 0;
                    revHigh = Number.parseInt(range[1]) || 0;
                } else {
                    revHigh = Number.parseInt(clean) || 0;
                }
            }

            // Upsert domain
            await db.insert(domains).values({
                domain: dom.domain,
                tld: tld,
                vertical: bucket.name,
                bucket: 'build', // Strategy bucket
                niche: bucket.niche,
                cloudflareAccount: bucket.cloudflare,
                themeStyle: bucket.theme,
                siteTemplate: template,
                monetizationModel: dom.monetization,
                monetizationTier: dom.tier || 3, // Default to 3
                estimatedRevenueAtMaturityLow: revLow,
                estimatedRevenueAtMaturityHigh: revHigh,
                status: 'active',
                contentConfig: {
                    schedule: {
                        frequency: 'sporadic',
                        timeOfDay: 'random',
                        wordCountRange: [1000, 2000]
                    }
                }
            }).onConflictDoUpdate({
                target: domains.domain,
                set: {
                    vertical: bucket.name,
                    bucket: 'build',
                    niche: bucket.niche,
                    cloudflareAccount: bucket.cloudflare,
                    themeStyle: bucket.theme,
                    siteTemplate: template,
                    monetizationModel: dom.monetization,
                    monetizationTier: dom.tier || 3,
                    estimatedRevenueAtMaturityLow: revLow,
                    estimatedRevenueAtMaturityHigh: revHigh,
                    status: 'active'
                }
            });
        }
    }

    console.log('[Seed] Bucket updates complete.');
}

// Top-level await
await seedBuckets().catch(console.error);
