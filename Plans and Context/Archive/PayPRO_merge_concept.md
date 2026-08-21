I want to merge my payroll administration system - PayPRO [Refer to master_context.md] into AutoPRO. At the same time, we will need to do a base44 database, function, and authentication deprecation similar to what we did for AutoPRO and WorkPRO. 

**Project Vision**

1. We will replace the authentication system from paypro's files and replace with AutoPro's. "PayPro" will become a module of AutoPro, not a sister application. This will eliminate the current payroll implementation and the payrolltransaction table. We will keep the accounting and banking logic from autopro.
2. We will create pages in AutoPro codebase to mirror PayPro's on AutoPro's directory. I want these to be placed in a directory /paypro/page_name
3. I want a complete frontend replication to paypro, with only changes being connection or usage of authentication, database, or backend function. All business logic, concepts, and UI/UX selections will be preserved to the best care possible. Each page should be carefully assessed and planned for. 
4.  Preserve business logic and field names for the backend. Data from PayPro will be imported to AutoPro using the same schema and will be exported from base44 as a csv into Supabase dashboard. Confirm with user what the schema for these are before full execution (treat as phase 1). Research Supabase and Vercel for integration concerns.
5. The AutoPro Layout Navbar will be altered to have the following options, mirroring the paypro nav, under the Payroll dropdown. This will only be available for users who have the paypro access granted as per employee table:
   1. Employees
   2. Time Records
   3. Payroll
   4. Pay Stubs
   5. More - which will open a modal similar to reportmodal that will have following options:
      1. Remittances
      2. T4s
      3. Reports
      4. Trends
      5. Setup
6. Each function will be have convention: paypro-[functionname], despite being integrated with autopro. This will indicate belongs to the payroll module (and garners more security and care)
7. Employee data from paypro will form the table name: EmployeePayrollData. Each calling location is being edited anyway to reflect supabase call, so mine as well make this to differentiate the employee data (SIN, DOBs, etc.) with employee user data (authentication, user identification, and Access Control) so that different RLS policies can be applied requiring higher security flags. Can I have advice on options or considerations for this?
8. Cancel Payment and Mark as Paid for paystubs and remittances from paypro will be used with additional autopro accounting and banking logic (GLTransaction and BankTransaction) 
9. Don't lose autopro's create/edit payroll adjustment logic just yet - we need something integrated on paypro's navigation for this - options? Feedback and ideas?
10. AutoPro and PayPro share the same Resend API secret - reintegrate. DO NOT include payroll emails in the sentemaillog. 
11. We will add a cron job feature - will run every tenth day of each month; triggers a function that will check if there was a remittance payment in the last 10 days. True=function concluded. False=send email to tyler@kensauto.ca and advise that a remittance has not been created this month yet - check PayPro for info. This is not present on base44 or PayPro at all yet - new feature. 
12. 