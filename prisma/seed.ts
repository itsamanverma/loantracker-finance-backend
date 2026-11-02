import { PrismaClient, AccessType, LoanStatus, PaymentStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function calculateEMI(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clear transactional tables to start fresh
  console.log('🧹 Clearing old transactional data...');
  await prisma.payment.deleteMany();
  await prisma.smsLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.loan.deleteMany();
  console.log('🧹 Transactional data cleared');

  // 2. Seed interest rates
  const interestRates = [
    { durationMonths: 2, interestRate: 12.5 },
    { durationMonths: 3, interestRate: 11.0 },
    { durationMonths: 6, interestRate: 9.5 },
    { durationMonths: 12, interestRate: 8.0 },
  ];

  for (const rate of interestRates) {
    await prisma.interestRate.upsert({
      where: { durationMonths: rate.durationMonths },
      update: { interestRate: rate.interestRate },
      create: rate,
    });
  }
  console.log('✅ Interest rates seeded');

  // 3. Hash passwords once for efficiency
  const sharedPasswordHash = await bcrypt.hash('Admin@123', 12);

  // 4. Seed SUPER_ADMIN
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@loantracker.in' },
    update: { passwordHash: sharedPasswordHash },
    create: {
      email: 'superadmin@loantracker.in',
      passwordHash: sharedPasswordHash,
      fullName: 'Super Admin',
      mobileNo: '9999999999',
      accessType: AccessType.SUPER_ADMIN,
      department: 'Administration',
      permissions: [
        'manage_loans',
        'manage_payments',
        'export_data',
        'view_reports',
        'system_config',
        'audit_logs',
      ],
      isActive: true,
    },
  });
  console.log('✅ Super admin user seeded');

  // 5. Seed ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@loantracker.in' },
    update: { passwordHash: sharedPasswordHash },
    create: {
      email: 'admin@loantracker.in',
      passwordHash: sharedPasswordHash,
      fullName: 'Rohit Sharma',
      mobileNo: '9876543210',
      accessType: AccessType.ADMIN,
      department: 'Operations',
      permissions: [
        'manage_loans',
        'manage_payments',
        'view_reports',
        'export_data',
        'audit_logs',
      ],
      isActive: true,
    },
  });
  console.log('✅ Admin user seeded');

  // 6. Seed SUB_ADMIN
  const subAdmin = await prisma.user.upsert({
    where: { email: 'subadmin@loantracker.in' },
    update: { passwordHash: sharedPasswordHash },
    create: {
      email: 'subadmin@loantracker.in',
      passwordHash: sharedPasswordHash,
      fullName: 'Sanjay Kumar',
      mobileNo: '9777777777',
      accessType: AccessType.SUB_ADMIN,
      department: 'Credit Risk',
      permissions: ['manage_loans'],
      isActive: true,
    },
  });
  console.log('✅ Sub admin user seeded');

  // 7. Seed Dummy Loans & Payments
  console.log('🏦 Seeding dummy loan portfolios...');

  const today = new Date();

  // --- Loan 1: Active Loan (Priya Singh) ---
  // Started 3 months ago. 6 months duration. Month 1, 2, 3 PAID. Month 4, 5, 6 PENDING.
  const l1Amount = 500000;
  const l1Rate = 9.5;
  const l1Duration = 6;
  const l1Emi = calculateEMI(l1Amount, l1Rate, l1Duration);
  const l1Total = l1Emi * l1Duration;
  
  const l1Start = new Date(today);
  l1Start.setMonth(today.getMonth() - 3);
  const l1End = new Date(l1Start);
  l1End.setMonth(l1Start.getMonth() + l1Duration);

  const loan1 = await prisma.loan.create({
    data: {
      userId: admin.id,
      customerName: 'Priya Singh',
      customerMobile: '9876543210',
      mobileVerified: true,
      verificationToken: 'seeded-token-l1',
      amount: l1Amount,
      durationMonths: l1Duration,
      interestRate: l1Rate,
      emiAmount: Number(l1Emi.toFixed(2)),
      totalAmount: Number(l1Total.toFixed(2)),
      startDate: l1Start,
      endDate: l1End,
      status: LoanStatus.ACTIVE,
    },
  });

  // Generate payments for Loan 1
  for (let i = 0; i < l1Duration; i++) {
    const dueDate = new Date(l1Start);
    dueDate.setMonth(l1Start.getMonth() + i + 1);
    const isPaid = i < 3; // First 3 installments are paid
    
    await prisma.payment.create({
      data: {
        loanId: loan1.id,
        installment: i + 1,
        dueDate,
        amount: Number(l1Emi.toFixed(2)),
        status: isPaid ? PaymentStatus.PAID : PaymentStatus.PENDING,
        paidDate: isPaid ? new Date(dueDate) : null,
      },
    });
  }

  // --- Loan 2: Pending Loan (Vikram Malhotra) ---
  // Starts next month. All payments pending.
  const l2Amount = 150000;
  const l2Rate = 11.0;
  const l2Duration = 3;
  const l2Emi = calculateEMI(l2Amount, l2Rate, l2Duration);
  const l2Total = l2Emi * l2Duration;
  
  const l2Start = new Date(today);
  l2Start.setMonth(today.getMonth() + 1);
  const l2End = new Date(l2Start);
  l2End.setMonth(l2Start.getMonth() + l2Duration);

  const loan2 = await prisma.loan.create({
    data: {
      userId: subAdmin.id,
      customerName: 'Vikram Malhotra',
      customerMobile: '9988776655',
      mobileVerified: true,
      verificationToken: 'seeded-token-l2',
      amount: l2Amount,
      durationMonths: l2Duration,
      interestRate: l2Rate,
      emiAmount: Number(l2Emi.toFixed(2)),
      totalAmount: Number(l2Total.toFixed(2)),
      startDate: l2Start,
      endDate: l2End,
      status: LoanStatus.PENDING,
    },
  });

  for (let i = 0; i < l2Duration; i++) {
    const dueDate = new Date(l2Start);
    dueDate.setMonth(l2Start.getMonth() + i + 1);
    await prisma.payment.create({
      data: {
        loanId: loan2.id,
        installment: i + 1,
        dueDate,
        amount: Number(l2Emi.toFixed(2)),
        status: PaymentStatus.PENDING,
        paidDate: null,
      },
    });
  }

  // --- Loan 3: Default Loan (Rajesh Kumar) ---
  // Started 4 months ago. 12 months duration. Month 1, 2 PAID. Month 3, 4 OVERDUE. Month 5+ PENDING.
  const l3Amount = 300000;
  const l3Rate = 8.0;
  const l3Duration = 12;
  const l3Emi = calculateEMI(l3Amount, l3Rate, l3Duration);
  const l3Total = l3Emi * l3Duration;
  
  const l3Start = new Date(today);
  l3Start.setMonth(today.getMonth() - 4);
  const l3End = new Date(l3Start);
  l3End.setMonth(l3Start.getMonth() + l3Duration);

  const loan3 = await prisma.loan.create({
    data: {
      userId: admin.id,
      customerName: 'Rajesh Kumar',
      customerMobile: '9123456789',
      mobileVerified: true,
      verificationToken: 'seeded-token-l3',
      amount: l3Amount,
      durationMonths: l3Duration,
      interestRate: l3Rate,
      emiAmount: Number(l3Emi.toFixed(2)),
      totalAmount: Number(l3Total.toFixed(2)),
      startDate: l3Start,
      endDate: l3End,
      status: LoanStatus.DEFAULT,
    },
  });

  for (let i = 0; i < l3Duration; i++) {
    const dueDate = new Date(l3Start);
    dueDate.setMonth(l3Start.getMonth() + i + 1);
    
    let status: PaymentStatus = PaymentStatus.PENDING;
    let paidDate: Date | null = null;

    if (i < 2) {
      status = PaymentStatus.PAID;
      paidDate = new Date(dueDate);
    } else if (dueDate < today) {
      status = PaymentStatus.OVERDUE;
    }

    await prisma.payment.create({
      data: {
        loanId: loan3.id,
        installment: i + 1,
        dueDate,
        amount: Number(l3Emi.toFixed(2)),
        status,
        paidDate,
      },
    });
  }

  // --- Loan 4: Closed Loan (Karan Johar) ---
  // Started 3 months ago. 2 months duration. All PAID.
  const l4Amount = 80000;
  const l4Rate = 12.5;
  const l4Duration = 2;
  const l4Emi = calculateEMI(l4Amount, l4Rate, l4Duration);
  const l4Total = l4Emi * l4Duration;
  
  const l4Start = new Date(today);
  l4Start.setMonth(today.getMonth() - 3);
  const l4End = new Date(l4Start);
  l4End.setMonth(l4Start.getMonth() + l4Duration);

  const loan4 = await prisma.loan.create({
    data: {
      userId: superAdmin.id,
      customerName: 'Karan Johar',
      customerMobile: '9555555555',
      mobileVerified: true,
      verificationToken: 'seeded-token-l4',
      amount: l4Amount,
      durationMonths: l4Duration,
      interestRate: l4Rate,
      emiAmount: Number(l4Emi.toFixed(2)),
      totalAmount: Number(l4Total.toFixed(2)),
      startDate: l4Start,
      endDate: l4End,
      status: LoanStatus.CLOSED,
    },
  });

  for (let i = 0; i < l4Duration; i++) {
    const dueDate = new Date(l4Start);
    dueDate.setMonth(l4Start.getMonth() + i + 1);
    await prisma.payment.create({
      data: {
        loanId: loan4.id,
        installment: i + 1,
        dueDate,
        amount: Number(l4Emi.toFixed(2)),
        status: PaymentStatus.PAID,
        paidDate: new Date(dueDate),
      },
    });
  }

  console.log('✅ Dummy loans and payment schedules seeded successfully');

  // 8. Seed Audit Logs
  console.log('📝 Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        userId: superAdmin.id,
        action: 'CREATE_USER',
        entityType: 'user',
        entityId: admin.id,
        details: { email: admin.email, role: admin.accessType },
        ipAddress: '127.0.0.1',
      },
      {
        userId: superAdmin.id,
        action: 'CREATE_USER',
        entityType: 'user',
        entityId: subAdmin.id,
        details: { email: subAdmin.email, role: subAdmin.accessType },
        ipAddress: '127.0.0.1',
      },
      {
        userId: admin.id,
        action: 'CREATE_LOAN',
        entityType: 'loan',
        entityId: loan1.id,
        details: { customerName: loan1.customerName, amount: loan1.amount },
        ipAddress: '127.0.0.1',
      },
      {
        userId: admin.id,
        action: 'CREATE_LOAN',
        entityType: 'loan',
        entityId: loan3.id,
        details: { customerName: loan3.customerName, amount: loan3.amount },
        ipAddress: '127.0.0.1',
      },
      {
        userId: admin.id,
        action: 'UPDATE_LOAN_STATUS',
        entityType: 'loan',
        entityId: loan3.id,
        details: { previousStatus: 'ACTIVE', newStatus: 'DEFAULT' },
        ipAddress: '127.0.0.1',
      },
    ],
  });
  console.log('✅ Audit logs seeded');

  // 9. Seed SMS Logs
  console.log('📱 Seeding SMS broadcast logs...');
  await prisma.smsLog.createMany({
    data: [
      {
        loanId: loan1.id,
        customerMobile: loan1.customerMobile,
        messageContent: 'Your loan application of ₹500,000 has been approved.',
        status: 'SENT',
      },
      {
        loanId: loan3.id,
        customerMobile: loan3.customerMobile,
        messageContent: 'ALERT: Your EMI payment of ₹26101.12 is overdue.',
        status: 'SENT',
      },
    ],
  });
  console.log('✅ SMS logs seeded');

  console.log('🎉 Database seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
